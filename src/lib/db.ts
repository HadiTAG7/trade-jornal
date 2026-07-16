import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/integrations/firebase/client';

// All user data lives under users/{uid}/<collection>/<docId>, so every query
// is structurally scoped to the signed-in user (enforced by security rules).

const BATCH_LIMIT = 500;

export function nowIso() {
  return new Date().toISOString();
}

function userCol(uid: string, name: string) {
  return collection(db, 'users', uid, name);
}

function withId<T>(snap: { id: string; data: () => unknown }): T {
  return { id: snap.id, ...(snap.data() as Record<string, unknown>) } as T;
}

// ---- generic reads ----

export async function fetchAll<T>(
  uid: string,
  coll: string,
  orderField?: string,
  direction: 'asc' | 'desc' = 'asc',
): Promise<T[]> {
  const q = orderField
    ? query(userCol(uid, coll), orderBy(orderField, direction))
    : query(userCol(uid, coll));
  const snap = await getDocs(q);
  return snap.docs.map((d) => withId<T>(d));
}

export async function fetchById<T>(uid: string, coll: string, id: string): Promise<T | null> {
  const snap = await getDoc(doc(db, 'users', uid, coll, id));
  return snap.exists() ? withId<T>(snap) : null;
}

// ---- generic writes ----

export async function insertItem(
  uid: string,
  coll: string,
  data: Record<string, unknown>,
): Promise<string> {
  const ref = doc(userCol(uid, coll));
  await setDoc(ref, { ...data, user_id: uid, created_at: nowIso() });
  return ref.id;
}

export async function updateItem(
  uid: string,
  coll: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  await updateDoc(doc(db, 'users', uid, coll, id), { ...data, updated_at: nowIso() });
}

export async function deleteItem(uid: string, coll: string, id: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, coll, id));
}

export async function bulkUpdate(
  uid: string,
  coll: string,
  ids: string[],
  data: Record<string, unknown>,
): Promise<void> {
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const id of ids.slice(i, i + BATCH_LIMIT)) {
      batch.update(doc(db, 'users', uid, coll, id), { ...data, updated_at: nowIso() });
    }
    await batch.commit();
  }
}

export async function bulkDelete(uid: string, coll: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const id of ids.slice(i, i + BATCH_LIMIT)) {
      batch.delete(doc(db, 'users', uid, coll, id));
    }
    await batch.commit();
  }
}

export async function bulkInsert(
  uid: string,
  coll: string,
  rows: Record<string, unknown>[],
): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const row of rows.slice(i, i + BATCH_LIMIT)) {
      const ref = doc(userCol(uid, coll));
      batch.set(ref, { ...row, user_id: uid, created_at: nowIso(), updated_at: nowIso() });
      written++;
    }
    await batch.commit();
  }
  return written;
}

// ---- trades ----

// Imported trades use stable_hash as the document ID, so re-importing the
// same file can never create duplicates (mirrors the old unique constraint
// on (user_id, stable_hash)).
export async function importTradesByHash(
  uid: string,
  rows: Array<Record<string, unknown> & { stable_hash: string }>,
): Promise<number> {
  const unique = new Map<string, Record<string, unknown>>();
  for (const row of rows) unique.set(row.stable_hash, row);
  const entries = [...unique.entries()];

  for (let i = 0; i < entries.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const [hash, row] of entries.slice(i, i + BATCH_LIMIT)) {
      batch.set(doc(db, 'users', uid, 'trades', hash), {
        ...row,
        user_id: uid,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
    }
    await batch.commit();
  }
  return entries.length;
}

export async function fetchTradesByExitRange<T>(
  uid: string,
  startIso: string,
  endIso: string,
): Promise<T[]> {
  const q = query(
    userCol(uid, 'trades'),
    where('exit_datetime', '>=', startIso),
    where('exit_datetime', '<=', endIso),
    orderBy('exit_datetime', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => withId<T>(d));
}

// ---- journal entries (doc id = yyyy-MM-dd, natural upsert key) ----

export async function getJournalEntry<T>(uid: string, date: string): Promise<T | null> {
  return fetchById<T>(uid, 'journal_entries', date);
}

export async function upsertJournalEntry(
  uid: string,
  date: string,
  data: Record<string, unknown>,
): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, 'journal_entries', date),
    { ...data, user_id: uid, date, updated_at: nowIso() },
    { merge: true },
  );
}
