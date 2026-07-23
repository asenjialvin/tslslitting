import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Download, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchPlanDetail } from "@/lib/queries";
import { exportPlanToXlsx, type PlanLineExport } from "@/lib/export";
import { CombinationCard } from "@/components/combination-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/plans/$planId")({
  head: () => ({ meta: [{ title: "Plan — Slitting Planner" }] }),
  component: PlanDetail,
});

const STATUS_FLOW: Record<string, string[]> = {
  draft: ["released", "cancelled"],
  released: ["in_progress", "cancelled"],
  in_progress: ["done", "cancelled"],
  done: [],
  cancelled: [],
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Submit as draft",
  released: "Release",
  in_progress: "Mark in progress",
  done: "Mark done",
  cancelled: "Cancel",
};

function PlanDetail() {
  const { planId } = Route.useParams();
  const id = Number(planId);
  const { hasAtLeast } = useAuth();
  const qc = useQueryClient();

  const detail = useQuery({
    queryKey: ["plan-detail", id],
    queryFn: () => fetchPlanDetail(id),
  });

  const canEdit = hasAtLeast("manager") && detail.data?.plan.status === "draft";
  // Per RBAC: Manager owns release, progress, complete, and cancel.
  const canTransition = hasAtLeast("manager");

  const removeLine = useMutation({
    mutationFn: async (planLineId: number) => {
      const { error } = await supabase
        .from("plan_line")
        .delete()
        .eq("plan_line_id", planLineId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Line removed");
      qc.invalidateQueries({ queryKey: ["plan-detail", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase
        .from("plan")
        .update({
          status: status as
            | "cancelled"
            | "done"
            | "draft"
            | "in_progress"
            | "released",
        })
        .eq("plan_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["plan-detail", id] });
      qc.invalidateQueries({ queryKey: ["plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const download = async () => {
    if (!detail.data) return;
    const lines: PlanLineExport[] = detail.data.lines.map((l) => ({
      sequence: l.sequence,
      coilThicknessMm: l.combination.coil.thickness_mm,
      coilWidthMm: l.combination.coil.width_mm,
      noOfCoils: l.no_of_coils,
      segments: l.combination.lines.map((cl) => ({
        slitWidthMm: cl.slit.width_mm,
        slitCount: cl.slit_count,
        productLabel: cl.product,
      })),
      totalWidthMm: l.combination.total_slit_width_mm ?? 0,
      scrapMm: Math.max(
        0,
        l.combination.coil.width_mm - (l.combination.total_slit_width_mm ?? 0),
      ),
    }));
    const blob = await exportPlanToXlsx(detail.data.plan.plan_number, lines);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${detail.data.plan.plan_number}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (detail.isLoading)
    return <p className="p-6 text-xs text-muted-foreground">Loading…</p>;
  if (!detail.data)
    return <p className="p-6 text-xs text-muted-foreground">Plan not found.</p>;

  const { plan, lines } = detail.data;
  const totalCoils = lines.reduce((s, l) => s + l.no_of_coils, 0);
  const avgScrap =
    lines.length > 0
      ? lines.reduce(
          (s, l) =>
            s +
            Math.max(
              0,
              l.combination.coil.width_mm -
                (l.combination.total_slit_width_mm ?? 0),
            ),
          0,
        ) / lines.length
      : 0;

  return (
    <div className="px-3 py-4 space-y-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div>
          <h1 className="font-mono text-base font-semibold tracking-tight sm:text-lg">
            {plan.plan_number}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {plan.machine?.code ?? "—"}
            </Badge>
            <span className="text-[11px] capitalize text-muted-foreground">
              {plan.status.replace("_", " ")}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {plan.status !== "draft" && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={download}
            >
              <Download className="h-3.5 w-3.5" /> Download XLSX
            </Button>
          )}
          {canEdit && (
            <Button asChild size="sm" className="h-7 gap-1 text-xs">
              <Link
                to="/plans/$planId/lines/new"
                params={{ planId: String(id) }}
              >
                <Plus className="h-3.5 w-3.5" /> Add coil
              </Link>
            </Button>
          )}
          {STATUS_FLOW[plan.status]?.map((next) => {
            if (!canTransition) return null;
            return (
              <Button
                key={next}
                size="sm"
                variant={next === "cancelled" ? "destructive" : "secondary"}
                className="h-7 text-xs"
                onClick={() => setStatus.mutate(next)}
              >
                {STATUS_LABEL[next]}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-xl border border-border/70 bg-card shadow-sm p-2 text-center text-xs">
        <div>
          <div className="text-muted-foreground">Lines</div>
          <div className="font-mono font-semibold">{lines.length}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Coils</div>
          <div className="font-mono font-semibold">{totalCoils}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Avg. scrap</div>
          <div className="font-mono font-semibold">{avgScrap.toFixed(1)} mm</div>
        </div>
      </div>

      <div className="space-y-2">
        {lines.map((l) => (
          <CombinationCard
            key={l.plan_line_id}
            combo={l.combination}
            right={
              <>
                <span>{l.no_of_coils} coils</span>
                {canEdit && (
                  <>
                    <Button
                      asChild
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                    >
                      <Link
                        to="/plans/$planId/lines/$lineId/edit"
                        params={{
                          planId: String(id),
                          lineId: String(l.plan_line_id),
                        }}
                        aria-label="Edit line"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive"
                      onClick={() => {
                        if (confirm("Remove this line?"))
                          removeLine.mutate(l.plan_line_id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </>
            }
          />
        ))}
        {lines.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No coils added yet.
          </p>
        )}
      </div>
    </div>
  );
}
