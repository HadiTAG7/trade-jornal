import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase web config is public client configuration (it ships in every
// browser bundle); access control is enforced by Firestore security rules.
// Env vars override these defaults when set (e.g. to point at another project).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDmpVzNcmAKWlursP8MQSqo7ozsLIuxS4E',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'tradelog-488bb.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'tradelog-488bb',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'tradelog-488bb.firebasestorage.app',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:768463726990:web:e36fd110d5076ce33a9cdf',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
