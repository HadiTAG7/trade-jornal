#!/usr/bin/env node
/**
 * One-time migration: imports a tradelog-export JSON file (from the old
 * Supabase backend) into Firebase (Auth + Firestore).
 *
 * Usage:
 *   node scripts/migrate-to-firebase.mjs <export.json> <email> <password>
 *
 * Reads the Firebase web config from the VITE_FIREBASE_* variables in .env
 * (or the environment). Creates the Auth user if it doesn't exist, then
 * writes all data under users/{uid}/... in batches.
 * Re-running is safe: documents keep their original IDs, so it overwrites
 * rather than duplicates.
 */
import { readFileSync, existsSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { getFirestore, doc, writeBatch } from 'firebase/firestore';

const [exportPath, email, password] = process.argv.slice(2);
if (!exportPath || !email || !password) {
  console.error('Usage: node scripts/migrate-to-firebase.mjs <export.json> <email> <password>');
  process.exit(1);
}

// Load .env so the script works without exporting variables manually.
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const config = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: process.env.VITE_FIREBASE_APP_ID,
};
if (!config.apiKey || !config.projectId) {
  console.error('Missing VITE_FIREBASE_* config in .env / environment.');
  process.exit(1);
}

const exportData = JSON.parse(readFileSync(exportPath, 'utf8'));
if (exportData.format !== 'tradelog-export') {
  console.error('Not a tradelog-export file.');
  process.exit(1);
}

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

// --- sign in (create the account on first run) ---
let cred;
try {
  cred = await createUserWithEmailAndPassword(auth, email, password);
  console.log(`Created new Firebase user: ${email}`);
} catch (err) {
  if (err.code === 'auth/email-already-in-use') {
    cred = await signInWithEmailAndPassword(auth, email, password);
    console.log(`Signed in as existing user: ${email}`);
  } else {
    throw err;
  }
}
const uid = cred.user.uid;
console.log(`Firebase uid: ${uid}`);

const nowIso = new Date().toISOString();

function normalizeDatetime(value) {
  if (typeof value !== 'string' || !value) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toISOString();
}

function cleanRow(row, { datetimeFields = [], dropFields = [] } = {}) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'id' || dropFields.includes(k)) continue;
    out[k] = datetimeFields.includes(k) ? normalizeDatetime(v) : v;
  }
  out.user_id = uid; // replace the old Supabase user id
  return out;
}

const BATCH_LIMIT = 500;
async function writeAll(collName, rows, docIdFor, options) {
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const row of rows.slice(i, i + BATCH_LIMIT)) {
      const ref = doc(db, 'users', uid, collName, docIdFor(row));
      batch.set(ref, cleanRow(row, options));
      written++;
    }
    await batch.commit();
    process.stdout.write(`\r${collName}: ${written}/${rows.length}`);
  }
  if (rows.length) process.stdout.write('\n');
  return written;
}

const t = exportData.tables;
const summary = {};

// Profile -> users/{uid} root document
{
  const profile = (t.profiles ?? [])[0] ?? {};
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'users', uid),
    { ...cleanRow(profile), email, migrated_at: nowIso, migrated_from: exportData.source ?? null },
    { merge: true },
  );
  await batch.commit();
  summary.profile = 1;
  console.log('profile: 1/1');
}

const DT = ['entry_datetime', 'exit_datetime', 'created_at', 'updated_at', 'started_at', 'finished_at'];

summary.strategies = await writeAll('strategies', t.strategies ?? [], r => r.id, { datetimeFields: DT });
summary.accounts = await writeAll('accounts', t.accounts ?? [], r => r.id, { datetimeFields: DT });
summary.tags = await writeAll('tags', t.tags ?? [], r => r.id, { datetimeFields: DT });
summary.mistakes = await writeAll('mistakes', t.mistakes ?? [], r => r.id, { datetimeFields: DT });
summary.trades = await writeAll('trades', t.trades ?? [], r => r.id, { datetimeFields: DT });
summary.imports = await writeAll('imports', t.imports ?? [], r => r.id, { datetimeFields: DT });
summary.journal_entries = await writeAll(
  'journal_entries',
  t.journal_entries ?? [],
  r => r.date, // doc id = yyyy-MM-dd (the app's natural upsert key)
  { datetimeFields: DT },
);

console.log('\nMigration complete:');
for (const [k, v] of Object.entries(summary)) console.log(`  ${k}: ${v}`);
process.exit(0);
