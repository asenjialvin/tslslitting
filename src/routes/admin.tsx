import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Plus, Copy, FlaskConical, ShieldCheck, LayoutDashboard } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Slitting Planner" }] }),
  component: AdminPage,
});

const ROLES: AppRole[] = ["viewer", "manager", "admin"];

type RoleRow = { id: string; user_id: string; role: AppRole; created_at: string };

function AdminPage() {
  const { hasAtLeast, loading, user } = useAuth();
  const qc = useQueryClient();
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("viewer");

  const roles = useQuery({
    queryKey: ["user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as RoleRow[];
    },
    enabled: hasAtLeast("manager"),
  });

  const addRole = useMutation({
    mutationFn: async () => {
      const id = newUserId.trim();
      if (!id) throw new Error("Paste a user ID first");
      const { error } = await supabase.from("user_roles").insert({ user_id: id, role: newRole });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role granted");
      setNewUserId("");
      qc.invalidateQueries({ queryKey: ["user-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: AppRole }) => {
      const { error } = await supabase.from("user_roles").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["user-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role removed");
      qc.invalidateQueries({ queryKey: ["user-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyMyId = async () => {
    if (!user) return;
    await navigator.clipboard.writeText(user.id);
    toast.success("Your user ID was copied — send it to an Admin to get a role.");
  };

  if (loading) return null;
  if (!hasAtLeast("manager")) return <Navigate to="/" />;

  return (
    <div className="px-3 py-3 space-y-4">
      <div>
        <h1 className="text-sm font-semibold tracking-tight">Admin panel</h1>
        <p className="text-[11px] text-muted-foreground">
          Critical actions in one place, instead of editing the database directly.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
          <Link to="/bulk-lab">
            <FlaskConical className="h-3.5 w-3.5" /> Bulk combination lab
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
          <Link to="/audit">
            <ShieldCheck className="h-3.5 w-3.5" /> Audit log
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
          <Link to="/dashboard">
            <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
          </Link>
        </Button>
      </div>

      <div className="rounded-md border bg-card p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold">User roles</h2>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={copyMyId}>
            <Copy className="h-3.5 w-3.5" /> Copy my user ID
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          There's no way to look up someone by email from here (that requires a
          service-role key we don't have access to). Ask the person to sign in once,
          then use "Copy my user ID" above and send it to you, or find their ID in the
          Supabase dashboard under Authentication → Users.
        </p>

        <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 p-2">
          <div className="flex-1 min-w-[220px]">
            <label className="mb-1 block text-[10px] uppercase text-muted-foreground">
              User ID (UUID)
            </label>
            <Input
              className="h-8 text-xs font-mono"
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase text-muted-foreground">
              Role
            </label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
              <SelectTrigger className="h-8 w-32 text-xs capitalize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => addRole.mutate()}
            disabled={addRole.isPending}
          >
            <Plus className="h-3.5 w-3.5" /> Grant
          </Button>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[480px] text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">User ID</th>
                <th className="px-3 py-2 text-left font-medium">Role</th>
                <th className="px-3 py-2 text-left font-medium">Granted</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.data?.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">
                    {r.user_id}
                    {r.user_id === user?.id && (
                      <span className="ml-1 text-[10px] text-primary">(you)</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <Select
                      value={r.role}
                      onValueChange={(v) => updateRole.mutate({ id: r.id, role: v as AppRole })}
                    >
                      <SelectTrigger className="h-7 w-28 text-xs capitalize">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((role) => (
                          <SelectItem key={role} value={role} className="capitalize">
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeRole.mutate(r.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {roles.data?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    No roles granted yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
