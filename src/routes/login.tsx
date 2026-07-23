import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Factory } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logo from "@/assets/TNK_logo.png";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Slitting Planner" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Signed in");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-primary to-steel-900 lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:24px_24px]" />
        <div className="relative flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-white">
            <Factory className="h-5 w-5" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-white">Slitting Planner</span>
        </div>
        <div className="relative space-y-3">
          <h2 className="max-w-sm text-2xl font-semibold leading-tight tracking-tight text-white">
            Coil-to-product slitting, planned end to end.
          </h2>
          <p className="max-w-sm text-sm text-white/60">
            Manage combinations, track scrap, and plan production runs for the
            slitting line — all in one place.
          </p>
        </div>
        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} Tononoka Steels</p>
      </div>

      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="mb-2 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md bg-white p-1 shadow-sm ring-1 ring-border">
              <img src={logo} alt="Tononoka Steels" className="h-full w-full object-contain" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Slitting Planner</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              This is private production data — accounts are provisioned by an
              administrator. If you don't have credentials yet, contact your admin.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 text-sm"
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 text-sm"
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" className="h-10 w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
