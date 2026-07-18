// Daily broker sync (Vercel Serverless Function + Cron).
//
// Pulls closed trades from the user's existing "Trading Helper" service
// (which is connected to Schwab), converts them to TradeLog's trade shape,
// and writes them into Firestore under users/{uid}/trades. Trades are keyed
// by a stable hash so re-runs never create duplicates.
//
// Invoked daily by Vercel Cron (see vercel.json). Protected by CRON_SECRET:
// Vercel sends "Authorization: Bearer <CRON_SECRET>" on cron requests.
//
// Firestore writes use a Firebase Admin service account (minting a Google
// access token via the JWT-bearer grant), so the sync is independent of the
// user's login password.
//
// Required environment variables (set in Vercel project settings):
//   RAILWAY_URL / RAILWAY_PASSWORD        the Trading Helper service + login
//   FIREBASE_SERVICE_ACCOUNT_B64          base64 of the service-account JSON
//   TARGET_UID                            uid whose trades to write
//   VITE_FIREBASE_PROJECT_ID              Firebase project id
//   CRON_SECRET                           secret Vercel attaches to cron calls
//   SYNC_DAYS                             optional look-back (default 45)

import crypto from 'node:crypto';

const FIRESTORE = 'https://firestore.googleapis.com/v1';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Mint a Google OAuth2 access token from the service account (JWT-bearer flow).
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
  const assertion = `${signingInput}.${signature}`;

  const r = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  if (!r.ok) throw new Error(`token mint failed: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  const idx = (name) => header.indexOf(name);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 4) continue;
    rows.push({
      closed_at_et: cols[idx('closed_at_et')],
      symbol: cols[idx('symbol')],
      side: cols[idx('side')],
      pnl: cols[idx('pnl')],
      r_multiple: cols[idx('r_multiple')],
    });
  }
  return rows;
}

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function toIso(closedAtEt) {
  const t = (closedAtEt || '').trim().replace(' ', 'T');
  return t.length === 16 ? `${t}:00` : t;
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

async function fetchTradesCsv(base, cookie, days) {
  const r = await fetch(`${base}/api/trades.csv?days=${days}`, { headers: { cookie } });
  if (!r.ok) throw new Error(`trades.csv failed: ${r.status}`);
  return r.text();
}

function buildTradeDoc(row, uid, nowIso) {
  const netPnl = parseFloat(row.pnl);
  const r = parseFloat(row.r_multiple);
  const exitIso = toIso(row.closed_at_et);
  return {
    fields: {
      user_id: { stringValue: uid },
      symbol: { stringValue: (row.symbol || '').toUpperCase() },
      side: { stringValue: row.side === 'SHORT' ? 'SHORT' : 'LONG' },
      entry_datetime: { stringValue: exitIso },
      exit_datetime: { stringValue: exitIso },
      entry_price: { doubleValue: 0 },
      exit_price: { nullValue: null },
      quantity: { integerValue: '0' },
      fees: { doubleValue: 0 },
      commissions: { doubleValue: 0 },
      net_pnl: { doubleValue: Number.isFinite(netPnl) ? netPnl : 0 },
      planned_r_override: Number.isFinite(r) ? { doubleValue: r } : { nullValue: null },
      source: { stringValue: 'Schwab' },
      created_at: { stringValue: nowIso },
      updated_at: { stringValue: nowIso },
    },
  };
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

// Authorize the request: either the Vercel cron secret, or a valid Firebase
// ID token belonging to TARGET_UID (so the signed-in owner can trigger a
// manual sync from the app without any secret shipped in the client bundle).
async function isAuthorized(req) {
  const auth = req.headers['authorization'] || '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return false;
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.VITE_FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: m[1] }),
      },
    );
    if (!r.ok) return false;
    const d = await r.json();
    const localId = d.users && d.users[0] && d.users[0].localId;
    return localId === process.env.TARGET_UID;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (!(await isAuthorized(req))) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const base = process.env.RAILWAY_URL;
    const days = parseInt(process.env.SYNC_DAYS || '45', 10);
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
    const uid = process.env.TARGET_UID;

    const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8'));
    const token = await getAccessToken(sa);

    const cookie = await railwayLogin(base, process.env.RAILWAY_PASSWORD);
    const csv = await fetchTradesCsv(base, cookie, days);
    const rows = parseCsv(csv);

    const nowIso = new Date().toISOString();
    const seen = new Map();
    let written = 0;

    for (const row of rows) {
      if (!row.symbol || !row.closed_at_et) continue;
      const key = `${row.symbol}|${row.side}|${toIso(row.closed_at_et)}|${row.pnl}`;
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      const docId = `schwab_${hash(key)}_${n}`;
      await writeTrade(projectId, uid, token, docId, buildTradeDoc(row, uid, nowIso));
      written++;
    }

    return res.status(200).json({ ok: true, rows: rows.length, written, uid });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
