// Widget data for the Android home-screen calendar.
//
// The widget re-renders every 30 minutes (updatePeriodMillis), but its data only
// changed when the app was opened, so a day of trading was invisible on the home
// screen until you launched TradeLog. The native background worker calls this to
// get fresh numbers without the app running.
//
// Returns the day -> net P&L map the widget renders, plus the last sync result so
// the worker can raise a notification when the sync has been failing.
//
// Auth: a Firebase ID token belonging to TARGET_UID, same as the manual sync.

import crypto from 'node:crypto';

const FIRESTORE = 'https://firestore.googleapis.com/v1';

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
  if (!r.ok) throw new Error(`token mint failed: ${r.status}`);
  return (await r.json()).access_token;
}

/** Verifies the caller is the account this deployment serves. */
async function authorize(req) {
  const auth = req.headers['authorization'] || '';
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return false;
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.VITE_FIREBASE_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: m[1] }) },
    );
    if (!r.ok) return false;
    const d = await r.json();
    return !!(d.users && d.users[0] && d.users[0].localId === process.env.TARGET_UID);
  } catch {
    return false;
  }
}

function fieldNumber(fields, name) {
  const f = fields && fields[name];
  if (!f) return null;
  if ('doubleValue' in f) return Number(f.doubleValue);
  if ('integerValue' in f) return Number(f.integerValue);
  return null;
}

function fieldString(fields, name) {
  const f = fields && fields[name];
  return f && 'stringValue' in f ? f.stringValue : null;
}

/**
 * When a trade's realized part was closed, matching `closedAt` in the app:
 * `exit_datetime`, then the last closing fill, then the entry time.
 *
 * The fills matter. A partially closed trade carries an exit price and realized
 * P&L but no `exit_datetime` — the scaled-out RKLB position is exactly this — and
 * bucketing it on its entry date put it on a different day of the widget than the
 * calendar showed.
 */
function closeDay(fields) {
  const exitIso = fieldString(fields, 'exit_datetime');
  if (exitIso) return exitIso.slice(0, 10);

  const fills = fields.executions && fields.executions.arrayValue && fields.executions.arrayValue.values;
  if (Array.isArray(fills) && fills.length > 0) {
    const opens = fieldString(fields, 'side') === 'SHORT' ? 'SELL' : 'BUY';
    let last = null;
    for (const fill of fills) {
      const f = fill && fill.mapValue && fill.mapValue.fields;
      if (!f) continue;
      const action = fieldString(f, 'action');
      const when = fieldString(f, 'datetime');
      if (!when || action === opens) continue;
      if (last === null || when > last) last = when;
    }
    if (last) return last.slice(0, 10);
  }

  const entryIso = fieldString(fields, 'entry_datetime');
  return entryIso ? entryIso.slice(0, 10) : '';
}

/**
 * Net P&L per day, computed the same way the app does: realized trades bucketed
 * on their close date, falling back to the entry date when nothing else says when.
 */
function daysFromTrades(documents, fromDay) {
  const days = {};
  for (const doc of documents) {
    const f = doc.fields || {};
    const netPnl = fieldNumber(f, 'net_pnl');
    const exitPrice = fieldNumber(f, 'exit_price');
    // Nothing realized means nothing to show for that day.
    if (netPnl === null && exitPrice === null) continue;

    const day = closeDay(f);
    if (!day || day < fromDay) continue;

    let pnl = netPnl;
    if (pnl === null) {
      const entryPrice = fieldNumber(f, 'entry_price') ?? 0;
      const qty = fieldNumber(f, 'quantity') ?? 0;
      const side = fieldString(f, 'side');
      pnl = (side === 'SHORT' ? entryPrice - exitPrice : exitPrice - entryPrice) * qty;
    }
    const fees = fieldNumber(f, 'fees') ?? 0;
    const commissions = fieldNumber(f, 'commissions') ?? 0;
    // The app's charts and the widget both show net, so subtract costs here too.
    days[day] = (days[day] || 0) + (pnl - fees - commissions);
  }
  for (const k of Object.keys(days)) days[k] = Math.round(days[k]);
  return days;
}

async function runQuery(projectId, uid, token, body) {
  const url = `${FIRESTORE}/projects/${projectId}/databases/(default)/documents/users/${uid}:runQuery`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`query failed: ${r.status}`);
  const rows = await r.json();
  return rows.filter((row) => row.document).map((row) => row.document);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!(await authorize(req))) return res.status(401).json({ error: 'unauthorized' });

  try {
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
    const uid = process.env.TARGET_UID;
    const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8'));
    const token = await getAccessToken(sa);

    // The widget can navigate a few months back, so send a window rather than
    // just the current month.
    const from = new Date();
    from.setMonth(from.getMonth() - 6);
    const fromDay = from.toISOString().slice(0, 10);

    // Two queries for the same reason the calendar needs two: most trades carry
    // exit_datetime, but a broker-synced one can report only a realized net_pnl
    // and then buckets on its entry date.
    const [byExit, byEntry] = await Promise.all(
      ['exit_datetime', 'entry_datetime'].map((field) =>
        runQuery(projectId, uid, token, {
          structuredQuery: {
            from: [{ collectionId: 'trades' }],
            where: {
              fieldFilter: {
                field: { fieldPath: field },
                op: 'GREATER_THAN_OR_EQUAL',
                value: { stringValue: fromDay },
              },
            },
          },
        }),
      ),
    );

    const byId = new Map();
    for (const doc of [...byExit, ...byEntry]) byId.set(doc.name, doc);
    const days = daysFromTrades([...byId.values()], fromDay);

    // Last sync outcome, so the worker can notify about a failing sync without a
    // second round trip.
    let sync = null;
    try {
      const r = await fetch(
        `${FIRESTORE}/projects/${projectId}/databases/(default)/documents/users/${uid}/sync_meta/last`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (r.ok) {
        const doc = await r.json();
        const f = doc.fields || {};
        sync = {
          ok: f.ok && 'booleanValue' in f.ok ? f.ok.booleanValue : null,
          finished_at: fieldString(f, 'finished_at'),
          error: fieldString(f, 'error'),
          trades: fieldNumber(f, 'trades'),
        };
      }
    } catch {
      // The widget still has its numbers; the sync banner is a bonus.
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      updated_at: new Date().toISOString(),
      from: fromDay,
      days,
      sync,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
