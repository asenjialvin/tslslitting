import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "viewer" | "planner" | "editor" | "manager" | "admin";

// Effective roles are limited to viewer / manager / admin. Legacy "planner" and
// "editor" DB rows are treated as manager so existing users keep access.
const ROLE_RANK: Record<AppRole, number> = {
  viewer: 0,
  planner: 1,
  editor: 1,
  manager: 1,
  admin: 2,
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  loading: boolean;
  hasAtLeast: (role: AppRole) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadRole(userId: string) {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (error || !mounted) return;
      if (!data || data.length === 0) {
        setRole(null);
        return;
      }
      // If a user somehow has multiple roles, use the highest-ranked one.
      const best = data
        .map((r) => r.role as AppRole)
        .sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a])[0];
      setRole(best);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) loadRole(data.session.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) loadRole(newSession.user.id);
      else setRole(null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const hasAtLeast = (required: AppRole) => {
    if (!role) return false;
    return ROLE_RANK[role] >= ROLE_RANK[required];
  };

  return (
    <AuthContext.Provider
      value={{ user: session?.user ?? null, session, role, loading, hasAtLeast }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
