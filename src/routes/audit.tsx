import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/audit")({
  head: () => ({ meta: [{ title: "Audit Log — Slitting Planner" }] }),
  component: AuditPage,
});

type AuditRow = {
  id: number;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  diff: unknown;
  created_at: string;
};

const ENTITIES = ["product", "coil_spec", "slit_spec", "combination", "plan", "plan_line"];

function AuditPage() {
  const { hasAtLeast, loading } = useAuth();
  const [entity, setEntity] = useState<string>("");
  const [userFilter, setUserFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const rows = useQuery({
    queryKey: ["audit-log", entity, userFilter, from, to],
    queryFn: async () => {
      let q = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200);
      if (entity) q = q.eq("entity", entity);
      if (userFilter) q = q.eq("user_id", userFilter);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to);
      const { data, error } = await q;
      if (error) throw error;
      return data as AuditRow[];
    },
    enabled: hasAtLeast("admin"),
  });

  if (loading) return null;
  if (!hasAtLeast("admin")) return <Navigate to="/" />;

  return (
    <div className="px-3 py-3 space-y-3">
      <h1 className="text-sm font-semibold tracking-tight">Audit log</h1>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2">
        <Select value={entity || "all"} onValueChange={(v) => setEntity(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="All entities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {ENTITIES.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="h-8 w-48 text-xs"
          placeholder="User ID"
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
        />
        <Input
          className="h-8 w-40 text-xs"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input
          className="h-8 w-40 text-xs"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full min-w-[600px] text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">When</th>
              <th className="px-3 py-2 text-left font-medium">User</th>
              <th className="px-3 py-2 text-left font-medium">Action</th>
              <th className="px-3 py-2 text-left font-medium">Entity</th>
              <th className="px-3 py-2 text-left font-medium">Entity ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.data?.map((r) => (
              <tr
                key={r.id}
                className="cursor-pointer border-t hover:bg-muted/30"
                onClick={() => setSelected(r)}
              >
                <td className="px-3 py-1.5 text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-1.5 font-mono text-muted-foreground">
                  {r.user_id ? r.user_id.slice(0, 8) : "—"}
                </td>
                <td className="px-3 py-1.5 capitalize">{r.action}</td>
                <td className="px-3 py-1.5">{r.entity}</td>
                <td className="px-3 py-1.5 font-mono text-muted-foreground">
                  {r.entity_id ?? "—"}
                </td>
              </tr>
            ))}
            {rows.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  No matching audit entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {selected?.action} · {selected?.entity} #{selected?.entity_id}
            </DialogTitle>
          </DialogHeader>
          {selected && <DiffView row={selected} />}
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DiffView({ row }: { row: AuditRow }) {
  const diff = row.diff as Record<string, unknown> | null;

  if (row.action === "update" && diff && "old" in diff && "new" in diff) {
    const oldObj = (diff.old ?? {}) as Record<string, unknown>;
    const newObj = (diff.new ?? {}) as Record<string, unknown>;
    const keys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));
    const changed = keys.filter((k) => JSON.stringify(oldObj[k]) !== JSON.stringify(newObj[k]));
    return (
      <div className="max-h-80 overflow-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-2 py-1 text-left">Field</th>
              <th className="px-2 py-1 text-left">Before</th>
              <th className="px-2 py-1 text-left">After</th>
            </tr>
          </thead>
          <tbody>
            {changed.map((k) => (
              <tr key={k} className="border-t">
                <td className="px-2 py-1 font-medium">{k}</td>
                <td className="px-2 py-1 text-destructive">{JSON.stringify(oldObj[k])}</td>
                <td className="px-2 py-1 text-success">{JSON.stringify(newObj[k])}</td>
              </tr>
            ))}
            {changed.length === 0 && (
              <tr>
                <td colSpan={3} className="px-2 py-4 text-center text-muted-foreground">
                  No field-level changes recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  // For insert/delete, triggers typically store { new: {...} } or { old: {...} }.
  const raw = (diff ?? {}) as Record<string, unknown>;
  const flat =
    raw && typeof raw === "object" && ("new" in raw || "old" in raw)
      ? ((raw.new ?? raw.old ?? {}) as Record<string, unknown>)
      : raw;
  const entries = Object.entries(flat);
  return (
    <div className="max-h-80 space-y-1 overflow-auto rounded-md border p-2 text-xs">
      {entries.length === 0 && (
        <p className="py-4 text-center text-muted-foreground">No payload recorded.</p>
      )}
      {entries.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2 border-b py-1 last:border-0">
          <span className="font-medium">{k}</span>
          <span className="max-w-[60%] truncate text-right font-mono text-muted-foreground">
            {typeof v === "string" ? v : JSON.stringify(v)}
          </span>
        </div>
      ))}
    </div>
  );

}
