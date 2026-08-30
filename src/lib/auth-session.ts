import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface AuthSnapshot {
  session: Session | null;
  loading: boolean;
}

let snapshot: AuthSnapshot = { session: null, loading: true };
let initialization: Promise<AuthSnapshot> | null = null;
let revision = 0;
const subscribers = new Set<(next: AuthSnapshot) => void>();

function publish(next: AuthSnapshot) {
  snapshot = next;
  subscribers.forEach((subscriber) => subscriber(next));
}

export function getAuthSnapshot() {
  return snapshot;
}

export function subscribeAuthState(subscriber: (next: AuthSnapshot) => void) {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

/** Initializes one shared auth listener and resolves the persisted session once. */
export async function ensureAuthInitialized(): Promise<AuthSnapshot> {
  if (!initialization) {
    initialization = (async () => {
      supabase.auth.onAuthStateChange((_event, session) => {
        revision += 1;
        publish({ session, loading: false });
      });

      const startedAtRevision = revision;
      const { data, error } = await supabase.auth.getSession();
      if (startedAtRevision === revision) {
        publish({ session: error ? null : data.session, loading: false });
      }
      return snapshot;
    })();
  }

  await initialization;
  // Always return the latest snapshot (the memoized promise resolves only once).
  return snapshot;
}
