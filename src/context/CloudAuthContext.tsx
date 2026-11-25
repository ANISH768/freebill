import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';

export interface GoogleSignInOutcome {
  user: FirebaseUser;
  gmailAccessToken: string | null;
}

interface CloudAuthContextValue {
  cloudUser: FirebaseUser | null;
  authLoading: boolean;
  authError: string | null;
  isSigningIn: boolean;
  hasGmailAccess: boolean;
  signInWithGoogle: () => Promise<GoogleSignInOutcome | null>;
  signOutGoogle: () => Promise<void>;
  getAuthToken: (forceRefresh?: boolean) => Promise<string | null>;
  getGmailAccessToken: () => string | null;
  clearAuthError: () => void;
}

const CloudAuthContext = createContext<CloudAuthContextValue | null>(null);

export function CloudAuthProvider({ children }: { children: React.ReactNode }) {
  const [cloudUser, setCloudUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [hasGmailAccess, setHasGmailAccess] = useState(false);

  // Strictly in-memory token storage (never persisted to localStorage or sessionStorage)
  const inMemoryIdTokenRef = useRef<string | null>(null);
  const inMemoryGmailTokenRef = useRef<string | null>(null);
  const isSigningInRef = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCloudUser(user);
      if (user) {
        try {
          inMemoryIdTokenRef.current = await user.getIdToken();
        } catch {
          inMemoryIdTokenRef.current = null;
        }
        if (!inMemoryGmailTokenRef.current && !isSigningInRef.current) {
          setHasGmailAccess(false);
        }
      } else {
        inMemoryIdTokenRef.current = null;
        inMemoryGmailTokenRef.current = null;
        setHasGmailAccess(false);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<GoogleSignInOutcome | null> => {
    setAuthError(null);
    setIsSigningIn(true);
    isSigningInRef.current = true;
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const gmailToken = credential?.accessToken || null;

      if (result.user) {
        inMemoryIdTokenRef.current = await result.user.getIdToken();
      }
      inMemoryGmailTokenRef.current = gmailToken;
      setHasGmailAccess(Boolean(gmailToken));

      return {
        user: result.user,
        gmailAccessToken: gmailToken,
      };
    } catch (err: any) {
      const code = err?.code || '';
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setAuthError('Unable to complete Google Sign-In. Please allow popups and try again.');
      }
      return null;
    } finally {
      isSigningInRef.current = false;
      setIsSigningIn(false);
    }
  }, []);

  const signOutGoogle = useCallback(async () => {
    setAuthError(null);
    inMemoryIdTokenRef.current = null;
    inMemoryGmailTokenRef.current = null;
    setHasGmailAccess(false);
    try {
      await signOut(auth);
    } catch {
      setAuthError('Failed to sign out. Please try again.');
    }
  }, []);

  const getAuthToken = useCallback(async (forceRefresh = false): Promise<string | null> => {
    const activeUser = auth.currentUser;
    if (!activeUser) {
      inMemoryIdTokenRef.current = null;
      return null;
    }
    try {
      const token = await activeUser.getIdToken(forceRefresh);
      inMemoryIdTokenRef.current = token;
      return token;
    } catch {
      return inMemoryIdTokenRef.current;
    }
  }, []);

  const getGmailAccessToken = useCallback((): string | null => {
    return inMemoryGmailTokenRef.current;
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <CloudAuthContext.Provider
      value={{
        cloudUser,
        authLoading,
        authError,
        isSigningIn,
        hasGmailAccess,
        signInWithGoogle,
        signOutGoogle,
        getAuthToken,
        getGmailAccessToken,
        clearAuthError,
      }}
    >
      {children}
    </CloudAuthContext.Provider>
  );
}

export function useCloudAuth(): CloudAuthContextValue {
  const ctx = useContext(CloudAuthContext);
  if (!ctx) {
    throw new Error('useCloudAuth must be used within a CloudAuthProvider');
  }
  return ctx;
}
