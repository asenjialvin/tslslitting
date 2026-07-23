import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip } from "recharts";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Slitting Planner" }] }),
  component: Dashboard,
});

const PIE_COLORS = ["hsl(207 90% 54%)", "hsl(145 63% 42%)", "hsl(36 100% 50%)"];

function Dashboard() {
  const { hasAtLeast } = useAuth();

  const metrics = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: async () => {
      const [
        coilSpecCount,
        slitSpecCount,
        combosBySource,
        machineSplit,
        weekPlans,
        scrapAgg,
        plansByStatus,
      ] = await Promise.all([
        supabase.from("coil_spec").select("spec_id", { count: "exact", head: true }),
        supabase.from("slit_spec").select("spec_id", { count: "exact", head: true }),
        supabase.from("combination").select("source"),
        supabase
          .from("combination_machine")
          .select("frequency, machine:machine_id ( code )"),
        supabase
          .from("plan")
          .select("plan_id", { count: "exact", head: true })
          .gte(
            "created_at",
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          ),
        supabase
          .from("combination")
          .select("scrap_mm, coil:coil_spec_id ( width_mm )")
          .not("scrap_mm", "is", null),
        supabase.from("plan").select("status"),
      ]);

      const bySource: Record<string, number> = {};
      for (const row of combosBySource.data ?? []) {
        bySource[row.source] = (bySource[row.source] ?? 0) + 1;
      }

      const byMachine: Record<string, number> = {};
      for (const row of (machineSplit.data ?? []) as Array<{
        frequency: number;
        machine: { code: string } | null;
      }>) {
        if (!row.machine) continue;
        byMachine[row.machine.code] = (byMachine[row.machine.code] ?? 0) + row.frequency;
      }

      const scrapRows = (scrapAgg.data ?? []) as Array<{
        scrap_mm: number;
        coil: { width_mm: number } | null;
      }>;
      const scrapMmVals = scrapRows.map((r) => r.scrap_mm);
      const avgScrap = scrapMmVals.length
        ? scrapMmVals.reduce((a, b) => a + b, 0) / scrapMmVals.length
        : 0;
      const scrapPctVals = scrapRows
        .filter((r) => r.coil?.width_mm)
        .map((r) => (r.scrap_mm / (r.coil!.width_mm || 1)) * 100);
      const avgScrapPct = scrapPctVals.length
        ? scrapPctVals.reduce((a, b) => a + b, 0) / scrapPctVals.length
        : 0;

      const byStatus: Record<string, number> = {};
      for (const row of plansByStatus.data ?? []) {
        byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
      }

      return {
        coilSpecCount: coilSpecCount.count ?? 0,
        slitSpecCount: slitSpecCount.count ?? 0,
        combinationsBySource: bySource,
        machineSplit: byMachine,
        plansThisWeek: weekPlans.count ?? 0,
        avgScrap,
        avgScrapPct,
        plansByStatus: byStatus,
      };
    },
  });


  const activity = useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, action, entity, entity_id, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: hasAtLeast("manager"),
  });

  const chartData = metrics.data
    ? Object.entries(metrics.data.machineSplit).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div className="px-3 py-4 space-y-4 sm:px-4">
      <div className="border-b border-border/60 pb-3">
        <h1 className="text-base font-semibold tracking-tight sm:text-lg">Dashboard</h1>
        <p className="text-xs text-muted-foreground">Live specs, combinations, and plan metrics</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Coil specs" value={metrics.data?.coilSpecCount ?? "—"} />
        <MetricCard label="Slit specs" value={metrics.data?.slitSpecCount ?? "—"} />
        <MetricCard
          label="Combinations"
          value={Object.values(metrics.data?.combinationsBySource ?? {}).reduce(
            (a, b) => a + b,
            0,
          )}
        />
        <MetricCard label="Plans (7d)" value={metrics.data?.plansThisWeek ?? "—"} />
        <MetricCard
          label="Avg. scrap"
          value={
            metrics.data
              ? `${metrics.data.avgScrap.toFixed(1)}mm · ${metrics.data.avgScrapPct.toFixed(2)}%`
              : "—"
          }
        />
        <MetricCard
          label="Curated / historical"
          value={`${metrics.data?.combinationsBySource["curated"] ?? 0} / ${metrics.data?.combinationsBySource["observed-historical"] ?? metrics.data?.combinationsBySource["imported"] ?? 0}`}
        />
      </div>

      {metrics.data?.plansByStatus && Object.keys(metrics.data.plansByStatus).length > 0 && (
        <div className="rounded-xl border border-border/70 bg-card shadow-sm p-2">
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Plans by status
          </h2>
          <div className="flex flex-wrap gap-2 text-xs">
            {["draft", "released", "in_progress", "done", "cancelled"].map((s) => (
              <div
                key={s}
                className="flex items-center gap-1.5 rounded border bg-background px-2 py-1"
              >
                <span className="capitalize text-muted-foreground">{s.replace("_", " ")}</span>
                <span className="font-mono font-semibold tabular-nums">
                  {metrics.data.plansByStatus[s] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}


      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border/70 bg-card shadow-sm p-3">
          <h2 className="mb-2 text-xs font-semibold text-muted-foreground">
            GMT vs 25T combination usage
          </h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={80}
                  paddingAngle={2}
                  label
                >
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="transparent" />
                  ))}
                </Pie>
                <RTooltip
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid hsl(var(--border) / 0.7)",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-12 text-center text-xs text-muted-foreground">No data yet.</p>
          )}
        </div>

        {hasAtLeast("manager") && (
          <div className="rounded-xl border border-border/70 bg-card shadow-sm p-3">
            <h2 className="mb-2 text-xs font-semibold text-muted-foreground">Recent activity</h2>
            <div className="max-h-[220px] space-y-1 overflow-auto text-xs">
              {activity.data?.map((a) => (
                <div key={a.id} className="flex items-center justify-between border-b border-border/60 py-1 last:border-0">
                  <span>
                    <span className="capitalize">{a.action}d</span> a {a.entity}
                    {a.entity_id ? ` #${a.entity_id}` : ""}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
              {activity.data?.length === 0 && (
                <p className="py-8 text-center text-muted-foreground">No recent activity.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card shadow-sm p-2.5 text-center">
      <div className="font-mono text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80">{label}</div>
    </div>
  );
}
