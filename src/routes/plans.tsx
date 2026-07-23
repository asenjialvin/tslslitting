import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchPlans, fetchMachines } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/plans")({
  head: () => ({ meta: [{ title: "Plans — Slitting Planner" }] }),
  component: PlansList,
});

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  released: "bg-secondary text-secondary-foreground",
  in_progress: "bg-warning/20 text-warning-foreground",
  done: "bg-success/20 text-success",
  cancelled: "bg-destructive/20 text-destructive",
};

function PlansList() {
  const { hasAtLeast } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [machineFilter, setMachineFilter] = useState<string>("");

  const plans = useQuery({ queryKey: ["plans"], queryFn: fetchPlans });
  const machines = useQuery({ queryKey: ["machines"], queryFn: fetchMachines });

  const create = useMutation({
    mutationFn: async () => {
      if (!machines.data || machines.data.length === 0) throw new Error("No machines found");
      const machineId = machines.data[0].machine_id;
      const planNumber = `PLN-${Date.now().toString(36).toUpperCase()}`;
      const { data, error } = await supabase
        .from("plan")
        .insert({ plan_number: planNumber, machine_id: machineId, status: "draft" })
        .select("plan_id")
        .single();
      if (error) throw error;
      return data.plan_id as number;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      navigate({ to: "/plans/$planId", params: { planId: String(id) } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    let rows = plans.data ?? [];
    if (statusFilter) rows = rows.filter((p) => p.status === statusFilter);
    if (machineFilter) rows = rows.filter((p) => p.machine?.code === machineFilter);
    return rows;
  }, [plans.data, statusFilter, machineFilter]);

  return (
    <div className="px-3 py-4 space-y-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <h1 className="text-base font-semibold tracking-tight sm:text-lg">Plans</h1>
        {hasAtLeast("manager") && (
          <Button
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => create.mutate()}
            disabled={create.isPending}
          >
            <Plus className="h-3.5 w-3.5" /> New plan
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card shadow-sm p-2">
        <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="released">Released</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={machineFilter || "all"} onValueChange={(v) => setMachineFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue placeholder="All machines" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All machines</SelectItem>
            {machines.data?.map((m) => (
              <SelectItem key={m.machine_id} value={m.code}>
                {m.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-sm">
        <table className="w-full min-w-[560px] text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground/80">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Plan #</th>
              <th className="px-3 py-2 text-left font-medium">Machine</th>
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Lines</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr
                key={p.plan_id}
                className="cursor-pointer border-t hover:bg-muted/30"
                onClick={() => navigate({ to: "/plans/$planId", params: { planId: String(p.plan_id) } })}
              >
                <td className="px-3 py-1.5 font-mono">
                  <Link
                    to="/plans/$planId"
                    params={{ planId: String(p.plan_id) }}
                    className="hover:underline"
                  >
                    {p.plan_number}
                  </Link>
                </td>
                <td className="px-3 py-1.5">
                  <Badge variant="secondary" className="text-[10px]">
                    {p.machine?.code ?? "—"}
                  </Badge>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {new Date(p.created_at).toLocaleDateString()}
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${STATUS_COLORS[p.status] ?? ""}`}
                  >
                    {p.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{p.line_count}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  No plans yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
