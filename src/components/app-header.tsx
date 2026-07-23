import { Link, useRouterState } from "@tanstack/react-router";
import { Moon, Sun, ShieldCheck, LogOut, Copy, Settings, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import logo from "@/assets/TNK_logo.png";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SECTION_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  planner: "Combination Finder",
  combinations: "Combinations",
  coils: "Coil Specs",
  slits: "Slit Specs",
  products: "Products",
  "bulk-lab": "Combination Generator",
  admin: "Admin",
  audit: "Audit Log",
  plans: "Plans",
};

function useBreadcrumb() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const segments = pathname.split("/").filter(Boolean);
  const root = segments[0];
  return root ? SECTION_LABELS[root] ?? root.replace(/-/g, " ") : null;
}

export function AppHeader() {
  const { user, role, hasAtLeast } = useAuth();
  const section = useBreadcrumb();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const isDark =
      typeof window !== "undefined" &&
      document.documentElement.classList.contains("dark");
    setDark(isDark);
  }, []);
  const toggleDark = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
    try {
      localStorage.setItem("tsl-theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  };

  const copyMyId = async () => {
    if (!user) return;
    await navigator.clipboard.writeText(user.id);
    toast.success("Your user ID was copied — send it to an Admin to get a role.");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-secondary/40 bg-gradient-to-r from-primary via-primary to-steel-900/95 text-primary-foreground shadow-[0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur supports-[backdrop-filter]:bg-primary/95">
      <div className="flex items-center gap-2 px-2 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
        <SidebarTrigger className="rounded-md text-primary-foreground hover:bg-white/10" />
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-1 shadow-sm sm:h-11 sm:w-11">
          <img src={logo} alt="Tononoka Steels" className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 truncate text-sm font-semibold tracking-tight sm:text-base">
            <span className="hidden sm:inline">Slitting Planner</span>
            {section && (
              <>
                <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-primary-foreground/40 sm:inline" />
                <span className="truncate">{section}</span>
              </>
            )}
          </div>
          <div className="hidden truncate text-[11px] text-primary-foreground/60 sm:block">
            Coil-to-product slitting planning &amp; combination library
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
          {user && role && (
            <Badge variant="secondary" className="hidden text-[10px] capitalize sm:inline-flex">
              {role}
            </Badge>
          )}
          {user && !role && (
            <Button
              size="sm"
              variant="ghost"
              className="hidden h-8 gap-1 text-primary-foreground hover:bg-white/10 sm:inline-flex"
              onClick={copyMyId}
              title="No role assigned yet — copy your ID to send to an Admin"
            >
              <Copy className="h-3.5 w-3.5" />
              <span className="text-xs">No role — copy ID</span>
            </Button>
          )}
          {user && hasAtLeast("admin") && (
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="hidden h-8 gap-1 text-primary-foreground hover:bg-white/10 sm:inline-flex"
            >
              <Link to="/audit">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs">Audit</span>
              </Link>
            </Button>
          )}
          {user && hasAtLeast("admin") && (
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="hidden h-8 gap-1 text-primary-foreground hover:bg-white/10 sm:inline-flex"
            >
              <Link to="/admin">
                <Settings className="h-4 w-4" />
                <span className="text-xs">Admin</span>
              </Link>
            </Button>
          )}
          <div className="mx-0.5 hidden h-5 w-px bg-white/15 sm:block" />
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-md text-primary-foreground hover:bg-white/10"
            onClick={toggleDark}
            aria-label="Toggle dark mode"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          {user ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-md text-primary-foreground hover:bg-white/10"
              onClick={() => supabase.auth.signOut()}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-8 rounded-md text-primary-foreground hover:bg-white/10"
            >
              <Link to="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
