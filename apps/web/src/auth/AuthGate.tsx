import type { ReactNode } from "react";

/**
 * The sign-in gate, wrapping the app in `App`. It passes its children straight through
 * until P3-C adds the name picker (local) and Supabase sign-in (deployed) here.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
