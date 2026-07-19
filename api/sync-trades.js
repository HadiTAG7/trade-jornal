// Daily broker sync (Vercel Serverless Function + Cron).
//
// Pulls the full trade log from the user's "Trading Helper" service (a SQLite
// backup with quantity, entry/exit prices and a broker order_id), converts
// each trade to TradeLog's shape, and writes them to Firestore under
// users/{uid}/trades. Trades are keyed by order_id so duplicate log rows
// collapse to one and re-runs never create duplicates. Stale Schwab-sourced
// trades (from a previous import scheme, or removed at the source) are pruned.
//
// Invoked daily by Vercel Cron (see vercel.json). Auth: the Vercel cron
// secret, or a Firebase ID token belonging to TARGET_UID (manual "Sync now").
//
// Env vars (Vercel): RAILWAY_URL, RAILWAY_PASSWORD, FIREBASE_SERVICE_ACCOUNT_B64,
// TARGET_UID, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_API_KEY, CRON_SECRET.

import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const FIRESTORE = 'https://firestore.googleapis.com/v1';
const require = createRequire(import.meta.url);

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claim}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = b64url(signer.sign(sa.private_key));
  const r = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signingInput}.${signature}`,
    }).toString(),
  });
  if (!r.ok) throw new Error(`token mint failed: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

async function railwayLogin(base, password) {
  const r = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password }).toString(),
    redirect: 'manual',
  });
  const cookie = r.headers.get('set-cookie');
  if (!cookie) throw new Error(`Railway login failed: ${r.status}`);
  return cookie.split(';')[0];
}

// Download the SQLite backup (gzip) and read the trade_log table.
async function fetchTradeLog(base, cookie) {
  const r = await fetch(`${base}/api/backup`, { headers: { cookie } });
  if (!r.ok) throw new Error(`backup failed: ${r.status}`);
  const gz = Buffer.from(await r.arrayBuffer());
  const dbBytes = zlib.gunzipSync(gz);

  const wasmBinary = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  const db = new SQL.Database(dbBytes);
  const out = db.exec(
    'SELECT id, order_id, symbol, side, qty, entry, exit, stop, r_multiple, pnl, source, opened_at, closed_at FROM trade_log',
  );
  if (!out.length) return [];
  const cols = out[0].columns;
  return out[0].values.map((v) => Object.fromEntries(v.map((x, i) => [cols[i], x])));
}

// Epoch seconds -> naive ET wall-clock ISO ("YYYY-MM-DDTHH:mm:ss"), matching
// the broker's US trading-day grouping used by the calendar/widget.
function toEtIso(epoch) {
  if (!epoch) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(epoch * 1000));
  const g = (t) => parts.find((p) => p.type === t).value;
  let h = g('hour');
  if (h === '24') h = '00';
  return `${g('year')}-${g('month')}-${g('day')}T${h}:${g('minute')}:${g('second')}`;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function buildTradeDoc(row, uid, nowIso) {
  const entryIso = toEtIso(row.opened_at) || toEtIso(row.closed_at);
  const exitIso = toEtIso(row.closed_at);
  const qty = num(row.qty) ?? 0;
  const entry = num(row.entry) ?? 0;
  const exit = num(row.exit);
  const stop = num(row.stop);
  const pnl = num(row.pnl);
  const r = num(row.r_multiple);
  const f = {
    user_id: { stringValue: uid },
    symbol: { stringValue: String(row.symbol || '').toUpperCase() },
    side: { stringValue: row.side === 'SHORT' ? 'SHORT' : 'LONG' },
    entry_datetime: { stringValue: entryIso },
    exit_datetime: exitIso ? { stringValue: exitIso } : { nullValue: null },
    entry_price: { doubleValue: entry },
    exit_price: exit === null ? { nullValue: null } : { doubleValue: exit },
    quantity: { integerValue: String(Math.round(qty)) },
    fees: { doubleValue: 0 },
    commissions: { doubleValue: 0 },
    stop_loss: stop === null ? { nullValue: null } : { doubleValue: stop },
    net_pnl: pnl === null ? { nullValue: null } : { doubleValue: pnl },
    planned_r_override: r === null ? { nullValue: null } : { doubleValue: r },
    notes: { stringValue: `Imported from broker${row.source ? ` (${row.source})` : ''}` },
    source: { stringValue: 'Schwab' },
    created_at: { stringValue: nowIso },
    updated_at: { stringValue: nowIso },
  };
  return { fields: f };
}

async function writeTrade(projectId, uid, token, docId, doc) {
  const url = `${FIRESTORE}/projects/${projectId}/databases/(default)/documents/users/${uid}/trades/${docId}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(doc),
  });
  if (!r.ok) throw new Error(`write ${docId} failed: ${r.status} ${await r.text()}`);
}

// Existing Schwab-sourced trade doc ids (via a source == 'Schwab' query).
async function listSchwabDocIds(projectId, uid, token) {
  const url = `${FIRESTORE}/projects/${projectId}/databases/(default)/documents/users/${uid}:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'trades' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'source' },
          op: 'EQUAL',
          value: { stringValue: 'Schwab' },
        },
      },
      select: { fields: [{ fieldPath: 'source' }] },
    },
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`query failed: ${r.status} ${await r.text()}`);
  const rows = await r.json();
  const ids = [];
  for (const row of rows) {
    if (row.document && row.document.name) ids.push(row.document.name.split('/').pop());
  }
  return ids;
}

async function deleteTrade(projectId, uid, token, docId) {
  const url = `${FIRESTORE}/projects/${projectId}/databases/(default)/documents/users/${uid}/trades/${docId}`;
  await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

async function isAuthorized(req) {
  const auth = req.headers['authorization'] || '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return false;
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.VITE_FIREBASE_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: m[1] }) },
    );
    if (!r.ok) return false;
    const d = await r.json();
    return d.users && d.users[0] && d.users[0].localId === process.env.TARGET_UID;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!(await isAuthorized(req))) return res.status(401).json({ error: 'unauthorized' });

  try {
    const base = process.env.RAILWAY_URL;
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
    const uid = process.env.TARGET_UID;
    const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8'));

    const token = await getAccessToken(sa);
    const cookie = await railwayLogin(base, process.env.RAILWAY_PASSWORD);
    const rows = await fetchTradeLog(base, cookie);

    // Dedup by broker order_id (collapses double-logged rows).
    const byKey = new Map();
    for (const row of rows) {
      if (!row.symbol || !row.closed_at) continue;
      const key = row.order_id ? String(row.order_id) : `id${row.id}`;
      if (!byKey.has(key)) byKey.set(key, row);
    }

    const nowIso = new Date().toISOString();
    const newIds = new Set();
    let written = 0;
    for (const [key, row] of byKey) {
      const docId = `schwab_${key}`;
      newIds.add(docId);
      await writeTrade(projectId, uid, token, docId, buildTradeDoc(row, uid, nowIso));
      written++;
    }

    // Prune stale Schwab trades (old import scheme / removed at source).
    let pruned = 0;
    try {
      const existing = await listSchwabDocIds(projectId, uid, token);
      for (const id of existing) {
        if (!newIds.has(id)) {
          await deleteTrade(projectId, uid, token, id);
          pruned++;
        }
      }
    } catch { /* pruning is best-effort */ }

    return res.status(200).json({ ok: true, rows: rows.length, written, pruned, uid });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
