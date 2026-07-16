import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword as firebaseUpdatePassword,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/integrations/firebase/client';

// Minimal user shape the app relies on (kept compatible with the previous
// Supabase user: `id` and `email`).
export interface AppUser {
  id: string;
  email: string | null;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  passwordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (password: string) => Promise<{ error: Error | null }>;
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toAppUser(u: FirebaseUser | null): AppUser | null {
  return u ? { id: u.uid, email: u.email } : null;
}

function friendlyError(err: unknown): Error {
  const code = (err as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/wrong-password': 'Invalid email or password.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/email-already-in-use': 'An account with this email already registered.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/network-request-failed': 'NetworkError: unable to connect.',
  };
  return new Error(map[code] ?? (err instanceof Error ? err.message : String(err)));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      setUser(toAppUser(fbUser));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { error: null };
    } catch (err) {
      return { error: friendlyError(err) };
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // Seed the user's profile document.
      await setDoc(
        doc(db, 'users', cred.user.uid),
        {
          user_id: cred.user.uid,
          email,
          created_at: new Date().toISOString(),
        },
        { merge: true },
      );
      return { error: null };
    } catch (err) {
      return { error: friendlyError(err) };
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email, {
        url: `${window.location.origin}/auth`,
      });
      return { error: null };
    } catch (err) {
      // If this domain isn't in Firebase's authorized list, send the email
      // without a continue URL (Firebase's hosted reset page still works).
      if ((err as { code?: string })?.code === 'auth/unauthorized-continue-uri') {
        try {
          await sendPasswordResetEmail(auth, email);
          return { error: null };
        } catch (retryErr) {
          return { error: friendlyError(retryErr) };
        }
      }
      return { error: friendlyError(err) };
    }
  };

  const updatePassword = async (password: string) => {
    try {
      if (!auth.currentUser) throw new Error('You must be signed in to change your password.');
      await firebaseUpdatePassword(auth.currentUser, password);
      return { error: null };
    } catch (err) {
      return { error: friendlyError(err) };
    }
  };

  const clearPasswordRecovery = () => setPasswordRecovery(false);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        passwordRecovery,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updatePassword,
        clearPasswordRecovery,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
