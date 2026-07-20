import { Link } from "@tanstack/react-router";
import { Moon, Sun, ShieldCheck, LogOut, Copy, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import logo from "@/assets/TNK_logo.png";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function AppHeader() {
  const { user, role, hasAtLeast } = useAuth();
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
    <header className="relative border-b-4 border-secondary bg-gradient-to-r from-primary to-steel-900 text-primary-foreground">
      <div className="flex items-center gap-2 px-2 py-2 sm:gap-3 sm:px-4 sm:py-3">
        <SidebarTrigger className="text-primary-foreground hover:bg-white/10" />
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-1 sm:h-14 sm:w-14">
          <img src={logo} alt="Tononoka Steels" className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold tracking-tight sm:text-base">
            Tononoka Steels Slitting Planner
          </div>
          <div className="hidden truncate text-[11px] text-primary-foreground/70 sm:block">
            Coil-to-product slitting planning &amp; combination library
          </div>
        </div>
        <div className="flex items-center gap-1">
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
          {user && hasAtLeast("manager") && (
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
          {user ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-primary-foreground hover:bg-white/10"
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
              className="h-8 text-primary-foreground hover:bg-white/10"
            >
              <Link to="/login">Sign in</Link>
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-primary-foreground hover:bg-white/10"
            onClick={toggleDark}
            aria-label="Toggle dark mode"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}
