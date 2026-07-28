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

// Map the broker log's `source` to one of the user's strategies.
// Automated sources ("*_bot", "ai_trader") are the bot; "manual" is a
// discretionary day trade. Unknown/absent sources stay unassigned rather
// than being guessed.
export function strategyForSource(source) {
  const s = String(source || '').toLowerCase();
  if (!s) return null;
  if (s.includes('bot') || s.includes('ai_') || s.includes('agent') || s.includes('algo')) return 'bot';
  if (s.includes('manual')) return 'Day Trade';
  return null;
}

/**
 * Planned risk seeded onto the strategies this sync creates.
 *
 * The broker sends a stop per trade, and |entry - stop| x quantity implied a
 * different risk on every one ($299, $60, $58...), so R multiples were not
 * comparable between trades of the same strategy. A strategy risks a fixed
 * amount per trade; the owner can change these in Settings afterwards and the
 * sync will not overwrite them.
 */
const DEFAULT_STRATEGY_RISK = { bot: 100, 'day trade': 300 };

// Look up the user's strategies by name (case-insensitive), creating any that
// are missing, and return maps of name -> id and name -> default risk.
async function ensureStrategies(projectId, uid, token, names) {
  const base = `${FIRESTORE}/projects/${projectId}/databases/(default)/documents/users/${uid}/strategies`;
  const r = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
  const existing = r.ok ? (await r.json()).documents || [] : [];
  const map = new Map();
  const risk = new Map();
  for (const doc of existing) {
    const name = doc.fields && doc.fields.name && doc.fields.name.stringValue;
    if (!name) continue;
    const key = name.toLowerCase();
    const docId = doc.name.split('/').pop();
    map.set(key, docId);

    const stored = doc.fields.default_risk;
    if (stored === undefined) {
      // The field predates this feature. Seed it onto the document so Settings
      // shows the same number the sync is about to use — otherwise the risk would
      // be applied invisibly, with the input sitting empty.
      const seeded = DEFAULT_STRATEGY_RISK[key] ?? null;
      risk.set(key, seeded);
      if (seeded !== null) {
        await fetch(
          `${base}/${docId}?updateMask.fieldPaths=default_risk`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ fields: { default_risk: { doubleValue: seeded } } }),
          },
        ).catch(() => {});
      }
      continue;
    }

    // An explicit null means the owner cleared it: fall back to the broker stop
    // rather than re-seeding a value they deliberately removed.
    const value = 'doubleValue' in stored ? Number(stored.doubleValue)
      : 'integerValue' in stored ? Number(stored.integerValue) : null;
    risk.set(key, value !== null && Number.isFinite(value) ? value : null);
  }

  const nowIso = new Date().toISOString();
  for (const name of names) {
    if (map.has(name.toLowerCase())) continue;
    const seeded = DEFAULT_STRATEGY_RISK[name.toLowerCase()] ?? null;
    const create = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        fields: {
          user_id: { stringValue: uid },
          name: { stringValue: name },
          description: { stringValue: 'Created automatically by broker sync' },
          color: { stringValue: name === 'bot' ? '#6366f1' : '#0ea5e9' },
          default_risk: seeded === null
            ? { nullValue: null }
            : { doubleValue: seeded },
          created_at: { stringValue: nowIso },
        },
      }),
    });
    if (create.ok) {
      const doc = await create.json();
      map.set(name.toLowerCase(), doc.name.split('/').pop());
      risk.set(name.toLowerCase(), seeded);
    }
  }
  return { ids: map, risk };
}

// Fields the sync owns and refreshes on every run. Everything the user can
// edit (notes, fills, MAE/MFE, account, review text, tags…) is deliberately
// absent here, and the write is masked to these keys so a sync can never
// clobber hand-entered data.
export function brokerFields(row, uid, nowIso) {
  const entryIso = toEtIso(row.opened_at) || toEtIso(row.closed_at);
  const exitIso = toEtIso(row.closed_at);
  const qty = num(row.qty) ?? 0;
  const entry = num(row.entry) ?? 0;
  const exit = num(row.exit);
  const stop = num(row.stop);
  const pnl = num(row.pnl);
  const r = num(row.r_multiple);
  return {
    user_id: { stringValue: uid },
    symbol: { stringValue: String(row.symbol || '').toUpperCase() },
    side: { stringValue: row.side === 'SHORT' ? 'SHORT' : 'LONG' },
    entry_datetime: { stringValue: entryIso },
    exit_datetime: exitIso ? { stringValue: exitIso } : { nullValue: null },
    entry_price: { doubleValue: entry },
    exit_price: exit === null ? { nullValue: null } : { doubleValue: exit },
    quantity: { integerValue: String(Math.round(qty)) },
    stop_loss: stop === null ? { nullValue: null } : { doubleValue: stop },
    net_pnl: pnl === null ? { nullValue: null } : { doubleValue: pnl },
    // Broker-reported R lives in its own field; planned_r_override stays the
    // user's to set.
    broker_r_multiple: r === null ? { nullValue: null } : { doubleValue: r },
    broker_order_id: { stringValue: row.order_id ? String(row.order_id) : '' },
    broker_source: { stringValue: String(row.source || '') },
    // True when the broker log had no open time, so hold time is not real.
    entry_time_estimated: { booleanValue: !row.opened_at },
    source: { stringValue: 'Schwab' },
    sync_fingerprint: { stringValue: fingerprint(row) },
    updated_at: { stringValue: nowIso },
  };
}

// Written only when the document is first created, so later user edits stick.
//
// `plannedRisk` is the strategy's fixed risk per trade. It goes in here rather
// than in `brokerFields` deliberately: `planned_risk_override` is the owner's
// field, so seeding it on creation gives every synced trade a comparable R while
// leaving them free to change it on any individual trade afterwards.
export function firstWriteFields(row, nowIso, plannedRisk) {
  const fields = {
    notes: { stringValue: `Imported from broker${row.source ? ` (${row.source})` : ''}` },
    fees: { doubleValue: 0 },
    commissions: { doubleValue: 0 },
    created_at: { stringValue: nowIso },
  };
  if (plannedRisk !== null && plannedRisk !== undefined && Number.isFinite(plannedRisk)) {
    fields.planned_risk_override = { doubleValue: plannedRisk };
  }
  return fields;
}

// Stable hash of the broker-side values: identical fingerprint => nothing to
// write, which keeps a steady state at zero writes.
export function fingerprint(row) {
  const parts = [
    row.symbol, row.side, row.qty, row.entry, row.exit,
    row.stop, row.pnl, row.r_multiple, row.opened_at, row.closed_at, row.source,
  ].map((v) => (v === null || v === undefined ? '' : String(v)));
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

// Fields derived from prices/quantity that the user's own fills own instead.
const FILL_DERIVED_FIELDS = [
  'quantity', 'entry_price', 'exit_price', 'entry_datetime', 'exit_datetime', 'net_pnl',
];

/**
 * Masked write. The mask is generated from the body's own keys — a path in the
 * mask with no value in the body would DELETE that field, so the two must
 * never be maintained separately.
 */
async function writeTradeFields(projectId, uid, token, docId, fields, { create }) {
  const params = Object.keys(fields)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');
  const guard = create ? '&currentDocument.exists=false' : '&currentDocument.exists=true';
  const url = `${FIRESTORE}/projects/${projectId}/databases/(default)/documents/users/${uid}/trades/${docId}?${params}${guard}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) {
    const body = await r.text();
    const err = new Error(`write ${docId} failed: ${r.status} ${body}`);
    err.status = r.status;
    throw err;
  }
}

// ET wall-clock ISO -> epoch seconds (uses the actual ET offset at that date).
function etIsoToEpoch(iso) {
  const guess = Date.parse(`${iso}Z`);
  const offsetName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'shortOffset',
  }).formatToParts(new Date(guess)).find((p) => p.type === 'timeZoneName').value; // e.g. GMT-4
  const m = offsetName.match(/GMT([+-]\d+)(?::(\d+))?/);
  const hours = m ? parseInt(m[1], 10) : -5;
  const mins = m && m[2] ? Math.sign(hours) * parseInt(m[2], 10) : 0;
  return Math.floor(guess / 1000) - (hours * 3600 + mins * 60);
}

// Parse any stored exit_datetime into epoch seconds. UTC-style stamps carry
// a zone ("Z"/offset); naive stamps are ET wall-clock (broker sync format).
function exitToEpoch(iso) {
  if (!iso) return null;
  if (/[zZ]$|[+-]\d\d:\d\d$/.test(iso)) {
    const t = Date.parse(iso);
    return Number.isFinite(t) ? Math.floor(t / 1000) : null;
  }
  return etIsoToEpoch(iso.length === 16 ? `${iso}:00` : iso);
}

// Delete non-Schwab copies of trades the broker log covers (e.g. earlier
// ThinkOrSwim/TraderVue imports of the same executions). A duplicate is the
// same symbol + same quantity closing within 5 minutes of a broker trade.
async function pruneCrossSourceDuplicates(projectId, uid, token, brokerRows, destructive, warnings) {
  const broker = brokerRows
    .filter((r) => r.symbol && r.closed_at)
    .map((r) => ({
      sym: String(r.symbol).toUpperCase(),
      qty: Math.round(Number(r.qty) || 0),
      t: Number(r.closed_at),
      exit: num(r.exit),
      orderId: r.order_id ? String(r.order_id) : '',
    }));
  if (!broker.length) return { deleted: 0, candidates: 0 };
  const minT = Math.min(...broker.map((b) => b.t)) - 86400;

  const url = `${FIRESTORE}/projects/${projectId}/databases/(default)/documents/users/${uid}:runQuery`;
  const isoFloor = new Date(minT * 1000).toISOString().slice(0, 10); // date prefix compares OK for both formats
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'trades' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'exit_datetime' },
          op: 'GREATER_THAN_OR_EQUAL',
          value: { stringValue: isoFloor },
        },
      },
      limit: 1000,
    },
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`dup query failed: ${r.status}`);
  const rows = await r.json();

  let deleted = 0;
  let candidates = 0;
  for (const row of rows) {
    if (!row.document) continue;
    const f = row.document.fields || {};
    const src = f.source && f.source.stringValue;
    if (src === 'Schwab') continue; // keep the broker copy
    if (f.archived && f.archived.booleanValue) continue; // already handled
    const sym = ((f.symbol && f.symbol.stringValue) || '').toUpperCase();
    const qty = Math.round(Number((f.quantity && (f.quantity.integerValue ?? f.quantity.doubleValue)) || 0));
    const exitPrice = f.exit_price && f.exit_price.doubleValue;
    const exitIso = f.exit_datetime && f.exit_datetime.stringValue;
    const t = exitToEpoch(exitIso);
    if (!sym || !t) continue;
    const match = broker.find((b) => {
      if (b.sym !== sym || b.qty !== qty || Math.abs(b.t - t) > 300) return false;
      // Price sanity check: same execution should price within 0.5%.
      if (b.exit != null && exitPrice != null && b.exit !== 0) {
        return Math.abs(exitPrice - b.exit) / Math.abs(b.exit) < 0.005;
      }
      return true;
    });
    if (!match) continue;
    candidates++;
    const docId = row.document.name.split('/').pop();
    if (destructive) {
      await deleteTrade(projectId, uid, token, docId);
      deleted++;
    } else {
      // Non-destructive: mark it so the UI can hide it and the owner can review.
      try {
        await writeTradeFields(projectId, uid, token, docId, {
          archived: { booleanValue: true },
          duplicate_of: { stringValue: `schwab_${match.orderId || ''}` },
        }, { create: false });
      } catch (err) {
        warnings.push(`could not flag duplicate ${docId}: ${err.message}`);
      }
    }
  }
  return { deleted, candidates };
}

// Existing Schwab-sourced trade doc ids (via a source == 'Schwab' query).
async function listSchwabDocs(projectId, uid, token) {
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
      select: {
        fields: [
          { fieldPath: 'source' },
          { fieldPath: 'strategy_id' },
          { fieldPath: 'sync_fingerprint' },
          { fieldPath: 'executions' },
        ],
      },
    },
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`query failed: ${r.status} ${await r.text()}`);
  const rows = await r.json();
  const docs = [];
  for (const row of rows) {
    if (!row.document || !row.document.name) continue;
    const f = row.document.fields || {};
    const fills = f.executions && f.executions.arrayValue && f.executions.arrayValue.values;
    docs.push({
      id: row.document.name.split('/').pop(),
      strategy_id: (f.strategy_id && f.strategy_id.stringValue) || null,
      sync_fingerprint: (f.sync_fingerprint && f.sync_fingerprint.stringValue) || null,
      hasFills: Array.isArray(fills) && fills.length > 0,
    });
  }
  return docs;
}

async function deleteTrade(projectId, uid, token, docId) {
  const url = `${FIRESTORE}/projects/${projectId}/databases/(default)/documents/users/${uid}/trades/${docId}`;
  await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

// --- run log -----------------------------------------------------------------
// Until now a failed sync was invisible: the cron's non-200 went to Vercel's
// logs and nowhere the owner would ever look, so the app could sit on stale
// data for days while still looking healthy. Every run — success or failure —
// now leaves a record the Settings page reads.

export function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFirestoreFields(v) } };
  return { stringValue: String(v) };
}

export function toFirestoreFields(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toFirestoreValue(v)]));
}

export function fromFirestoreValue(v) {
  if (!v || typeof v !== 'object') return v;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in v) {
    return Object.fromEntries(
      Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFirestoreValue(x)]),
    );
  }
  return null;
}

async function putDoc(projectId, uid, token, path, data) {
  const url = `${FIRESTORE}/projects/${projectId}/databases/(default)/documents/users/${uid}/${path}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  if (!r.ok) throw new Error(`write ${path} failed: ${r.status} ${await r.text()}`);
}

async function getDoc(projectId, uid, token, path) {
  const url = `${FIRESTORE}/projects/${projectId}/databases/(default)/documents/users/${uid}/${path}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const doc = await r.json();
  return Object.fromEntries(
    Object.entries(doc.fields || {}).map(([k, v]) => [k, fromFirestoreValue(v)]),
  );
}

/**
 * Writes `sync_meta/last` (what the UI shows) and appends to
 * `sync_runs/{yyyy-MM-dd}` (a short per-day history). Never throws: a failure
 * to record must not turn a successful sync into a failed one.
 */
export async function recordSyncRun(projectId, uid, token, summary) {
  // A failure before the access token is minted (bad service account, missing
  // project id) cannot be recorded — writing the record needs that same token.
  if (!projectId || !uid || !token) return;
  try {
    await putDoc(projectId, uid, token, 'sync_meta/last', summary);
    const day = summary.finished_at.slice(0, 10);
    const existing = await getDoc(projectId, uid, token, `sync_runs/${day}`);
    const runs = Array.isArray(existing && existing.runs) ? existing.runs : [];
    // Two scheduled runs a day plus the odd manual one; keep the day bounded.
    runs.push(summary);
    await putDoc(projectId, uid, token, `sync_runs/${day}`, {
      day,
      runs: runs.slice(-10),
      last_ok: summary.ok,
    });
  } catch (err) {
    console.error('sync run record failed:', err && err.message);
  }
}

/** Returns how the run was triggered, or null when the caller isn't allowed. */
async function authorize(req) {
  const auth = req.headers['authorization'] || '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return 'cron';
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return null;
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.VITE_FIREBASE_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: m[1] }) },
    );
    if (!r.ok) return null;
    const d = await r.json();
    const ok = d.users && d.users[0] && d.users[0].localId === process.env.TARGET_UID;
    return ok ? 'manual' : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const trigger = await authorize(req);
  if (!trigger) return res.status(401).json({ error: 'unauthorized' });

  const warnings = [];
  const startedAt = new Date().toISOString();
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  const uid = process.env.TARGET_UID;
  // Held outside the try so a failure part-way through can still be recorded.
  let token = null;

  try {
    const base = process.env.RAILWAY_URL;
    const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8'));

    token = await getAccessToken(sa);
    const cookie = await railwayLogin(base, process.env.RAILWAY_PASSWORD);
    const rows = await fetchTradeLog(base, cookie);

    // Dedup by broker order_id (collapses double-logged rows).
    const byKey = new Map();
    for (const row of rows) {
      if (!row.symbol || !row.closed_at) continue;
      const key = row.order_id ? String(row.order_id) : `id${row.id}`;
      if (!byKey.has(key)) byKey.set(key, row);
    }

    // Strategy per trade, from the broker log's source. Create the strategies
    // once, and never overwrite a strategy the user set by hand.
    const wanted = new Set();
    for (const row of byKey.values()) {
      const name = strategyForSource(row.source);
      if (name) wanted.add(name);
    }
    let strategyIds = new Map();
    let strategyRisk = new Map();
    if (wanted.size) {
      try {
        const resolved = await ensureStrategies(projectId, uid, token, [...wanted]);
        strategyIds = resolved.ids;
        strategyRisk = resolved.risk;
      } catch (err) {
        warnings.push(`strategy tagging skipped: ${err.message}`);
      }
    }

    // Existing synced docs: tells us what to create vs update, which docs
    // already carry a strategy or user fills, and what changed since last run.
    // A failure here is fatal — silently treating it as "no existing docs"
    // would recreate documents and drop manual strategy assignments.
    const existingDocs = await listSchwabDocs(projectId, uid, token);
    const existingById = new Map(existingDocs.map((d) => [d.id, d]));

    const nowIso = new Date().toISOString();
    const newIds = new Set();
    const strategyCounts = {};
    let created = 0;
    let written = 0;
    let unchanged = 0;
    let fillDerivedSkipped = 0;

    for (const [key, row] of byKey) {
      const docId = `schwab_${key}`;
      newIds.add(docId);
      const mappedName = strategyForSource(row.source);
      const mappedId = mappedName ? strategyIds.get(mappedName.toLowerCase()) || null : null;
      const prior = existingById.get(docId);
      strategyCounts[mappedName || 'unassigned'] =
        (strategyCounts[mappedName || 'unassigned'] || 0) + 1;

      const fields = brokerFields(row, uid, nowIso);

      if (!prior) {
        // First write: broker fields + the create-only defaults.
        const risk = mappedName ? strategyRisk.get(mappedName.toLowerCase()) ?? null : null;
        Object.assign(fields, firstWriteFields(row, nowIso, risk));
        if (mappedId) fields.strategy_id = { stringValue: mappedId };
        await writeTradeFields(projectId, uid, token, docId, fields, { create: true })
          .catch(async (err) => {
            // Lost a race (doc appeared meanwhile) — fall back to an update.
            if (err.status !== 409 && err.status !== 400) throw err;
            await writeTradeFields(projectId, uid, token, docId, fields, { create: false });
          });
        created++;
        written++;
        continue;
      }

      // Nothing changed upstream: skip the write entirely.
      if (prior.sync_fingerprint && prior.sync_fingerprint === fields.sync_fingerprint.stringValue) {
        unchanged++;
        continue;
      }

      // The user's own fills own the derived numbers — never overwrite them.
      if (prior.hasFills) {
        for (const f of FILL_DERIVED_FIELDS) delete fields[f];
        fillDerivedSkipped++;
      }
      // Only fill in a strategy that isn't set yet.
      if (!prior.strategy_id && mappedId) fields.strategy_id = { stringValue: mappedId };

      await writeTradeFields(projectId, uid, token, docId, fields, { create: false });
      written++;
    }

    // Prune stale synced trades, with a guard: an upstream hiccup (empty or
    // truncated broker log) must never wipe real trades.
    let pruned = 0;
    let pruneSkipped;
    const staleIds = existingDocs.filter((d) => !newIds.has(d.id)).map((d) => d.id);
    const pruneCap = Math.max(3, Math.ceil(existingDocs.length * 0.1));
    if (byKey.size === 0) {
      pruneSkipped = 'empty-source';
    } else if (staleIds.length > pruneCap) {
      pruneSkipped = `threshold (${staleIds.length} > ${pruneCap})`;
      warnings.push(`prune skipped: ${staleIds.length} stale docs exceeds cap ${pruneCap}`);
    } else {
      for (const id of staleIds) {
        try {
          await deleteTrade(projectId, uid, token, id);
          pruned++;
        } catch (err) {
          warnings.push(`delete ${id} failed: ${err.message}`);
        }
      }
    }

    // Remove older-source copies of the same executions (cross-source dupes).
    // Deletion is opt-in: without the flag we only report what would go, so a
    // false match can never destroy a hand-written trade.
    let dedupedCrossSource = 0;
    let dedupeCandidates = 0;
    try {
      const destructive = process.env.SYNC_PRUNE_DUPES === '1';
      const res = await pruneCrossSourceDuplicates(
        projectId, uid, token, [...byKey.values()], destructive, warnings,
      );
      dedupedCrossSource = res.deleted;
      dedupeCandidates = res.candidates;
      if (!destructive && res.candidates > 0) {
        warnings.push(`${res.candidates} cross-source duplicate(s) detected; set SYNC_PRUNE_DUPES=1 to delete`);
      }
    } catch (err) {
      warnings.push(`cross-source dedupe skipped: ${err.message}`);
    }

    const finishedAt = new Date().toISOString();
    const summary = {
      ok: true,
      trigger,
      started_at: startedAt,
      finished_at: finishedAt,
      duration_ms: Date.parse(finishedAt) - Date.parse(startedAt),
      rows: rows.length,
      trades: byKey.size,
      created,
      written,
      unchanged,
      fill_derived_skipped: fillDerivedSkipped,
      pruned,
      prune_skipped: pruneSkipped || null,
      deduped_cross_source: dedupedCrossSource,
      dedupe_candidates: dedupeCandidates,
      strategies: strategyCounts,
      warnings,
      error: null,
    };
    await recordSyncRun(projectId, uid, token, summary);

    return res.status(200).json({ ...summary, uid });
  } catch (err) {
    const finishedAt = new Date().toISOString();
    const message = String((err && err.message) || err);
    await recordSyncRun(projectId, uid, token, {
      ok: false,
      trigger,
      started_at: startedAt,
      finished_at: finishedAt,
      duration_ms: Date.parse(finishedAt) - Date.parse(startedAt),
      rows: 0,
      trades: 0,
      created: 0,
      written: 0,
      unchanged: 0,
      fill_derived_skipped: 0,
      pruned: 0,
      prune_skipped: null,
      deduped_cross_source: 0,
      dedupe_candidates: 0,
      strategies: {},
      warnings,
      error: message,
    });
    return res.status(500).json({ ok: false, trigger, error: message, warnings });
  }
}
