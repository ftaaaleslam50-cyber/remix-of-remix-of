import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  ensureAuthInitialized,
  getAuthSnapshot,
  subscribeAuthState,
  type AuthSnapshot,
} from "@/lib/auth-session";

interface AuthContextValue extends AuthSnapshot {
  user: User | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthSnapshot>(() => getAuthSnapshot());
  const userId = auth.session?.user?.id ?? null;

  useEffect(() => {
    const unsubscribe = subscribeAuthState(setAuth);
    void ensureAuthInitialized().then(setAuth);
    return () => {
      unsubscribe();
    };
  }, []);

  // Keep this device's push registration in sync with the signed-in account.
  useEffect(() => {
    if (!userId) return;
    let stop: (() => void) | undefined;
    void import("@/lib/push-notifications").then((mod) => {
      void mod.syncPushSubscriptionOnLoad(userId);
      stop = mod.listenForSubscriptionChanges(userId);
    });
    return () => stop?.();
  }, [userId]);

  return (
    <AuthContext.Provider value={{ ...auth, user: auth.session?.user ?? null }}>
      {children}
    </AuthContext.Provider>
  );
}


export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}

export type { Session };