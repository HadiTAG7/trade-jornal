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
// Required environment variables (set in Vercel project settings):
//   RAILWAY_URL        e.g. https://trading-claude-api-production.up.railway.app
//   RAILWAY_PASSWORD   login password for that service
//   SYNC_FIREBASE_EMAIL / SYNC_FIREBASE_PASSWORD   the TradeLog account to write as
//   VITE_FIREBASE_API_KEY / VITE_FIREBASE_PROJECT_ID   (already present)
//   CRON_SECRET        shared secret Vercel attaches to cron calls
//   SYNC_DAYS          optional, how many days to pull (default 45)

const FIRESTORE = 'https://firestore.googleapis.com/v1';
const IDENTITY = 'https://identitytoolkit.googleapis.com/v1';

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

// Deterministic small hash (djb2) -> hex. Stable across runs.
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function toIso(closedAtEt) {
  // "2026-06-17 09:44" -> "2026-06-17T09:44:00" (naive ET, matches the
  // broker's trading-day grouping used by the calendar/widget).
  const t = (closedAtEt || '').trim().replace(' ', 'T');
  return t.length === 16 ? `${t}:00` : t;
}

async function firebaseSignIn(apiKey, email, password) {
  const r = await fetch(`${IDENTITY}/accounts:signInWithPassword?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!r.ok) throw new Error(`Firebase sign-in failed: ${r.status} ${await r.text()}`);
  const d = await r.json();
  return { idToken: d.idToken, uid: d.localId };
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
  return cookie.split(';')[0]; // th_session=...
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

async function writeTrade(projectId, uid, idToken, docId, doc) {
  const url = `${FIRESTORE}/projects/${projectId}/databases/(default)/documents/users/${uid}/trades/${docId}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(doc),
  });
  if (!r.ok) throw new Error(`write ${docId} failed: ${r.status} ${await r.text()}`);
}

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'] || '';
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const base = process.env.RAILWAY_URL;
    const days = parseInt(process.env.SYNC_DAYS || '45', 10);
    const apiKey = process.env.VITE_FIREBASE_API_KEY;
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID;

    const { idToken, uid } = await firebaseSignIn(
      apiKey,
      process.env.SYNC_FIREBASE_EMAIL,
      process.env.SYNC_FIREBASE_PASSWORD,
    );
    const cookie = await railwayLogin(base, process.env.RAILWAY_PASSWORD);
    const csv = await fetchTradesCsv(base, cookie, days);
    const rows = parseCsv(csv);

    const nowIso = new Date().toISOString();
    const seen = new Map();
    let written = 0;

    for (const row of rows) {
      if (!row.symbol || !row.closed_at_et) continue;
      const base = `${row.symbol}|${row.side}|${toIso(row.closed_at_et)}|${row.pnl}`;
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      const docId = `schwab_${hash(base)}_${n}`;
      await writeTrade(projectId, uid, idToken, docId, buildTradeDoc(row, uid, nowIso));
      written++;
    }

    return res.status(200).json({ ok: true, rows: rows.length, written, uid });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err && err.message || err) });
  }
}
