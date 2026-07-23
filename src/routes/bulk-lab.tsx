import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Play, Check, X, RotateCcw, Loader2, FlaskConical, Save, Target, ChevronUp, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchProvisionalQueue, fetchMachines } from "@/lib/queries";
import { runBulkGeneration, regenerateForCoil, approveDraft, rejectDraft, saveCandidate, fetchCoilContext, fetchProductMapForThickness, canonicalStructuralKey, type BulkRunSummary } from "@/lib/bulk-lab";
import { enumerateAllCombinations, type EnumeratedCombination } from "@/lib/heuristic";
import { Badge } from "@/components/ui/badge";
import { CombinationCard } from "@/components/combination-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtThickness } from "@/lib/formula";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/bulk-lab")({
  head: () => ({ meta: [{ title: "Combination Generator — Slitting Planner" }] }),
  component: BulkLabPage,
});

function BulkLabPage() {
  const { hasAtLeast, loading } = useAuth();
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [lastSummary, setLastSummary] = useState<BulkRunSummary | null>(null);
  const [machinePicks, setMachinePicks] = useState<Record<number, number>>({});

  const machines = useQuery({ queryKey: ["machines"], queryFn: fetchMachines });
  const queue = useQuery({ queryKey: ["provisional-queue"], queryFn: fetchProvisionalQueue });

  const canGenerate = hasAtLeast("manager");
  const canReview = hasAtLeast("manager");

  const runGeneration = async () => {
    setRunning(true);
    setProgress({ done: 0, total: 0 });
    try {
      const summary = await runBulkGeneration((done, total) => setProgress({ done, total }));
      setLastSummary(summary);
      toast.success(
        `Generated ${summary.generated} draft combination(s) across ${summary.totalCoils} coil specs.`,
      );
      qc.invalidateQueries({ queryKey: ["provisional-queue"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk generation failed");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const approve = useMutation({
    mutationFn: async ({ id, machineId }: { id: number; machineId: number }) =>
      approveDraft(id, machineId),
    onSuccess: () => {
      toast.success("Approved — now visible in normal planning lookups.");
      qc.invalidateQueries({ queryKey: ["provisional-queue"] });
      qc.invalidateQueries({ queryKey: ["all-combos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: (id: number) => rejectDraft(id),
    onSuccess: () => {
      toast.success("Draft discarded.");
      qc.invalidateQueries({ queryKey: ["provisional-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const regenerate = useMutation({
    mutationFn: (coilSpecId: number) => regenerateForCoil(coilSpecId),
    onSuccess: (count) => {
      toast.success(count > 0 ? `Generated ${count} new draft(s).` : "No candidates found within scrap tolerance.");
      qc.invalidateQueries({ queryKey: ["provisional-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return null;
  if (!canReview) return <Navigate to="/" />;

  return (
    <div className="px-3 py-4 space-y-4 sm:px-4">
      <ExhaustiveDiscoveryPanel />

      <div className="flex items-center gap-3 pt-1">
        <div className="h-px flex-1 bg-border/60" />
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Or scan the whole catalog
        </span>
        <div className="h-px flex-1 bg-border/60" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight sm:text-lg">Full Catalog Sweep</h1>
          <p className="text-[11px] text-muted-foreground">
            Generates candidate layouts for coil specs with no approved combination yet,
            using three packing strategies (largest-first, reduced-largest, smallest-first),
            keeping only ones within ~2% scrap.
          </p>
        </div>
        {canGenerate && (
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={runGeneration} disabled={running}>
            {running ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {progress ? `${progress.done}/${progress.total}` : "Running…"}
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" /> Run bulk generation
              </>
            )}
          </Button>
        )}
      </div>

      {lastSummary && (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/70 bg-card shadow-sm p-2 text-center text-xs sm:grid-cols-4">
          <div>
            <div className="font-mono font-semibold">{lastSummary.totalCoils}</div>
            <div className="text-[10px] text-muted-foreground">Coils scanned</div>
          </div>
          <div>
            <div className="font-mono font-semibold">{lastSummary.skippedApproved}</div>
            <div className="text-[10px] text-muted-foreground">Already approved</div>
          </div>
          <div>
            <div className="font-mono font-semibold">{lastSummary.generated}</div>
            <div className="text-[10px] text-muted-foreground">Drafts generated</div>
          </div>
          <div>
            <div className="font-mono font-semibold text-warning-foreground">
              {lastSummary.coilsWithNoCandidates.length}
            </div>
            <div className="text-[10px] text-muted-foreground">Need manual design</div>
          </div>
        </div>
      )}

      {lastSummary && lastSummary.coilsWithNoCandidates.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-[11px]">
          <p className="mb-1 font-medium">
            No layout cleared the scrap tolerance for these coils — needs manual design:
          </p>
          <p className="font-mono text-muted-foreground">
            {lastSummary.coilsWithNoCandidates
              .map((c) => `${fmtThickness(c.thickness_mm)}×${c.width_mm}`)
              .join(", ")}
          </p>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-xs font-semibold text-muted-foreground">
          Pending combinations ({queue.data?.length ?? 0})
        </h2>
        {queue.isLoading ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>
        ) : queue.data && queue.data.length > 0 ? (
          <div className="space-y-2">
            {queue.data.map((c) => (
              <div key={c.combination_id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="border-warning/40 bg-warning/10 px-1.5 py-0 text-[10px] font-semibold text-warning-foreground">
                    Pending Approval
                  </Badge>
                </div>
                <CombinationCard combo={c} />
                {canReview && (
                  <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/70 bg-muted/20 px-2 py-1.5">
                    <Select
                      value={machinePicks[c.combination_id]?.toString() ?? ""}
                      onValueChange={(v) =>
                        setMachinePicks((prev) => ({ ...prev, [c.combination_id]: Number(v) }))
                      }
                    >
                      <SelectTrigger className="h-7 w-32 text-xs">
                        <SelectValue placeholder="Machine…" />
                      </SelectTrigger>
                      <SelectContent>
                        {machines.data?.map((m) => (
                          <SelectItem key={m.machine_id} value={m.machine_id.toString()}>
                            {m.code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      disabled={!machinePicks[c.combination_id] || approve.isPending}
                      onClick={() =>
                        approve.mutate({
                          id: c.combination_id,
                          machineId: machinePicks[c.combination_id],
                        })
                      }
                    >
                      <Check className="h-3.5 w-3.5" /> Approve &amp; promote
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-xs text-destructive"
                      disabled={reject.isPending}
                      onClick={() => reject.mutate(c.combination_id)}
                    >
                      <X className="h-3.5 w-3.5" /> Reject
                    </Button>
                    {canGenerate && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-xs"
                        disabled={regenerate.isPending}
                        onClick={() => regenerate.mutate(c.coil.spec_id)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Regenerate for this coil
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Nothing waiting for review. Run a bulk generation to fill gaps in the library.
          </p>
        )}
      </div>
    </div>
  );
}

function parseWidths(input: string): number[] {
  return input
    .split(/[,\s;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => Number(t))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** Parse target slit widths with an optional per-width max count:
 *  "149, 157:2, 99" → [{width:149},{width:157,max:2},{width:99}].
 *  The ":maxCount" suffix is optional — a plain width has no cap. */
function parseTargetsWithOptionalCaps(input: string): { width: number; max?: number }[] {
  return input
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const capped = t.match(/^\s*(\d+(?:\.\d+)?)\s*[:x*×]\s*(\d+)\s*$/);
      if (capped) {
        const width = Number(capped[1]);
        const max = Number(capped[2]);
        if (!Number.isFinite(width) || width <= 0 || !Number.isInteger(max) || max <= 0) return null;
        return { width, max };
      }
      const width = Number(t);
      if (!Number.isFinite(width) || width <= 0) return null;
      return { width };
    })
    .filter((t): t is { width: number; max?: number } => t !== null);
}

/** Weight helpers per user's formula.
 *  one_slit_weight = round((slit_width * avg_coil_weight) / (coil_width + 10))
 */
function oneSlitWeight(slitWidthMm: number, coilWidthMm: number, avgCoilWeightKg: number): number {
  if (!avgCoilWeightKg || coilWidthMm <= 0) return 0;
  return Math.round((slitWidthMm * avgCoilWeightKg) / (coilWidthMm + 10));
}

/** gross_slit_weight = one_slit_weight(0dp) * slit_count, then scaled by the
 *  number of physical coils being run so the figure reflects the expected
 *  weight of that slit size across all coils, not just one. */
function grossSlitWeight(
  slitWidthMm: number,
  coilWidthMm: number,
  avgCoilWeightKg: number,
  slitCount: number,
  numberOfCoils: number,
): number {
  return oneSlitWeight(slitWidthMm, coilWidthMm, avgCoilWeightKg) * slitCount * numberOfCoils;
}

type RunRow = {
  combo: EnumeratedCombination;
  coilSpecId: number | null;
  coilWidthMm: number;
  existingKeys: Set<string>;
  approvedKeys: Set<string>;
  keysByMachine: Record<string, Set<string>>;
};

function ExhaustiveDiscoveryPanel() {
  const qc = useQueryClient();
  const { hasAtLeast } = useAuth();
  const canApprove = hasAtLeast("manager");
  const machines = useQuery({ queryKey: ["machines"], queryFn: fetchMachines });

  const [thickness, setThickness] = useState("0.75");
  const [coilWidth, setCoilWidth] = useState("1160");
  const [minScrapMm, setMinScrapMm] = useState("4");
  const [maxScrapMm, setMaxScrapMm] = useState("24");
  const [maxKnives, setMaxKnives] = useState("15");
  const [avgCoilWeight, setAvgCoilWeight] = useState("10000");
  const [numberOfCoils, setNumberOfCoils] = useState("1");
  const [targetsText, setTargetsText] = useState("149:3, 157:2");
  const [sacrificesText, setSacrificesText] = useState("63, 79, 99, 119, 129");
  const [coilScope, setCoilScope] = useState<"single" | "all">("single");

  const [maxResults, setMaxResults] = useState("200");
  const [runRows, setRunRows] = useState<RunRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [running, setRunning] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [targetMachine, setTargetMachine] = useState<string>("null");

  const thicknessNum = Number(thickness);
  const coilWidthNum = Number(coilWidth);
  const avgWeightNum = Number(avgCoilWeight) || 0;
  const numberOfCoilsNum = Math.max(1, Math.round(Number(numberOfCoils)) || 1);
  const bumpCoils = (delta: number) => {
    setNumberOfCoils((prev) => String(Math.max(1, (Math.round(Number(prev)) || 1) + delta)));
  };

  const productMap = useQuery({
    queryKey: ["product-map", thicknessNum],
    queryFn: () => fetchProductMapForThickness(thicknessNum),
    enabled: Number.isFinite(thicknessNum) && thicknessNum > 0,
  });
  const machineLabel =
    targetMachine === "null"
      ? "Unassigned"
      : machines.data?.find((m) => m.machine_id.toString() === targetMachine)?.code ??
        `#${targetMachine}`;

  const parsedTargets = useMemo(() => parseTargetsWithOptionalCaps(targetsText), [targetsText]);
  const parsedSacrifices = useMemo(() => parseTargetsWithOptionalCaps(sacrificesText), [sacrificesText]);
  const targetWidths = useMemo(() => parsedTargets.map((t) => t.width), [parsedTargets]);
  const sacrificeWidths = useMemo(() => parsedSacrifices.map((t) => t.width), [parsedSacrifices]);
  const targetSet = useMemo(() => new Set(targetWidths), [targetWidths]);
  const widthMaxCounts = useMemo(() => {
    const m: Record<number, number> = {};
    for (const t of parsedTargets) if (t.max !== undefined) m[t.width] = t.max;
    for (const t of parsedSacrifices) if (t.max !== undefined) m[t.width] = t.max;
    return m;
  }, [parsedTargets, parsedSacrifices]);
  const allWidths = useMemo(
    () => Array.from(new Set([...targetWidths, ...sacrificeWidths])),
    [targetWidths, sacrificeWidths],
  );

  const isMultiCoil = coilScope === "all";

  const annotatedResults = useMemo(() => {
    if (!runRows) return null;
    const annotated = runRows.map((row) => {
      const key = canonicalStructuralKey(row.combo.picks);
      const machineScopedKeys = row.keysByMachine[targetMachine] ?? new Set<string>();
      const existsOnMachine = machineScopedKeys.has(key);
      const missingProduct = row.combo.picks.some(
        (p) => !productMap.data?.[p.slit_width_mm],
      );
      let distinctTargets = 0;
      let targetSlitCount = 0;
      for (const p of row.combo.picks) {
        if (targetSet.has(p.slit_width_mm) && p.slit_count > 0) {
          distinctTargets += 1;
          targetSlitCount += p.slit_count;
        }
      }
      return {
        row,
        canonicalKey: key,
        exists: row.existingKeys.has(key),
        approved: row.approvedKeys.has(key),
        existsOnMachine,
        missingProduct,
        distinctTargets,
        targetSlitCount,
      };
    });
    annotated.sort((a, b) => {
      if (targetSet.size > 0) {
        // Target match ratio first (3/3 before 2/3 before 1/3 before 0/3)…
        if (b.distinctTargets !== a.distinctTargets) return b.distinctTargets - a.distinctTargets;
        // …then least scrap…
        if (a.row.combo.scrap_mm !== b.row.combo.scrap_mm)
          return a.row.combo.scrap_mm - b.row.combo.scrap_mm;
        // …then most target slits packed…
        if (b.targetSlitCount !== a.targetSlitCount) return b.targetSlitCount - a.targetSlitCount;
        // …then fewest knives (simpler layout).
        return a.row.combo.knife_count - b.row.combo.knife_count;
      }
      if (a.row.combo.scrap_mm !== b.row.combo.scrap_mm)
        return a.row.combo.scrap_mm - b.row.combo.scrap_mm;
      return a.row.combo.knife_count - b.row.combo.knife_count;
    });
    return annotated;
  }, [runRows, targetMachine, productMap.data, targetSet]);


  const approveOne = async (
    canonicalKey: string,
    row: RunRow,
    existsOnMachine: boolean,
  ) => {
    if (!row.coilSpecId) {
      toast.error("No coil_spec matches this thickness × width — add the coil spec first.");
      return;
    }
    if (existsOnMachine) {
      toast.error(
        targetMachine === "null"
          ? "An identical unassigned draft already exists — approve or reject it in the queue below."
          : `Machine ${machineLabel} already has this exact combination.`,
      );
      return;
    }
    setSavingKey(`${row.coilSpecId}:${canonicalKey}`);
    try {
      const machineIdNum = targetMachine === "null" ? null : Number(targetMachine);
      const autoCreateMissingProducts = machineIdNum === null;
      const ok = await saveCandidate(
        row.coilSpecId,
        thicknessNum,
        {
          picks: row.combo.picks,
          total_width_mm: row.combo.total_width_mm,
          scrap_mm: row.combo.scrap_mm,
        },
        machineIdNum,
        { autoCreateMissingProducts },
      );
      if (!ok) {
        toast.error(
          "Couldn't save — one or more slit widths have no linked product yet. Map a product in the Slit Specs page and retry.",
        );
        return;
      }
      toast.success(
        machineIdNum
          ? `Promoted onto machine ${machineLabel}.`
          : "Saved as unassigned draft — visible in the approval queue below.",
      );
      const refreshed = await fetchCoilContext(thicknessNum, row.coilWidthMm);
      setRunRows((prev) =>
        prev
          ? prev.map((r) =>
              r.coilSpecId === row.coilSpecId
                ? {
                    ...r,
                    existingKeys: refreshed.existingKeys,
                    approvedKeys: refreshed.approvedKeys,
                    keysByMachine: refreshed.keysByMachine,
                  }
                : r,
            )
          : prev,
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["provisional-queue"] }),
        qc.invalidateQueries({ queryKey: ["all-combos"] }),
        qc.invalidateQueries({ queryKey: ["product-map", thicknessNum] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingKey(null);
    }
  };

  const run = async () => {
    const minS = Number(minScrapMm);
    const maxS = Number(maxScrapMm);
    if (!Number.isFinite(thicknessNum) || thicknessNum <= 0) {
      toast.error("Enter a valid thickness (mm).");
      return;
    }
    if (parsedTargets.length === 0) {
      toast.error("Add at least one target slit width.");
      return;
    }
    if (allWidths.length === 0) {
      toast.error("Add at least one target or sacrifice width.");
      return;
    }
    if (!Number.isFinite(minS) || minS < 0) {
      toast.error("Min scrap must be ≥ 0 mm.");
      return;
    }
    if (!Number.isFinite(maxS) || maxS < minS) {
      toast.error("Max scrap (mm) must be ≥ min scrap.");
      return;
    }
    const knivesCap = Math.min(15, Math.max(1, Number(maxKnives) || 15));
    const resultsCap = Math.max(1, Number(maxResults) || 200);

    setRunning(true);
    setTruncated(false);
    try {
      let coilTargets: { spec_id: number | null; width_mm: number }[];
      if (coilScope === "single") {
        if (!Number.isFinite(coilWidthNum) || coilWidthNum <= 0) {
          toast.error("Enter a valid coil width (mm).");
          setRunning(false);
          return;
        }
        const ctx = await fetchCoilContext(thicknessNum, coilWidthNum);
        coilTargets = [{ spec_id: ctx.coilSpecId, width_mm: coilWidthNum }];
      } else {
        const { data: coilRows, error } = await supabase
          .from("coil_spec")
          .select("spec_id, width_mm")
          .eq("thickness_mm", thicknessNum)
          .order("width_mm", { ascending: true });
        if (error) throw error;
        coilTargets = (coilRows ?? []).map((r) => ({ spec_id: r.spec_id, width_mm: r.width_mm }));
        if (coilTargets.length === 0) {
          toast.warning(`No coils found at ${fmtThickness(thicknessNum)} mm — add coils first.`);
          setRunRows([]);
          setRunning(false);
          return;
        }
      }

      const rows: RunRow[] = [];
      let anyTruncated = false;
      for (const coil of coilTargets) {
        const { results: r, truncated: t } = enumerateAllCombinations(
          allWidths,
          coil.width_mm,
          {
            minScrapMm: minS,
            maxScrapMm: maxS,
            maxKnives: knivesCap,
            maxResults: resultsCap,
            targetWidths,
            minTargetHits: 1,
            widthMaxCounts,
          },
        );
        if (t) anyTruncated = true;
        if (r.length === 0) continue;
        const ctx = await fetchCoilContext(thicknessNum, coil.width_mm);
        for (const combo of r) {
          rows.push({
            combo,
            coilSpecId: ctx.coilSpecId,
            coilWidthMm: coil.width_mm,
            existingKeys: ctx.existingKeys,
            approvedKeys: ctx.approvedKeys,
            keysByMachine: ctx.keysByMachine,
          });
        }
      }

      rows.sort(
        (a, b) =>
          a.combo.scrap_mm - b.combo.scrap_mm ||
          a.combo.knife_count - b.combo.knife_count,
      );

      setRunRows(rows);
      setTruncated(anyTruncated);
      if (rows.length === 0) {
        toast.warning("No combinations found within the scrap window that include a target slit.");
      } else {
        toast.success(
          `Found ${rows.length}${anyTruncated ? "+" : ""} combination(s)${
            isMultiCoil ? ` across ${coilTargets.length} coil(s)` : ""
          }.`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    setRunRows(null);
    setTruncated(false);
  };

  return (
    <div className="rounded-xl border border-border/70 bg-card shadow-sm p-3 space-y-3">
      <div>
        <h2 className="flex items-center gap-1.5 text-xs font-semibold">
          <FlaskConical className="h-3.5 w-3.5" /> Guided Discovery
        </h2>
        <p className="text-[11px] text-muted-foreground">
          Exhaustive search focused on your target slits — combinations that pack
          the most of your target widths are prioritized, sacrifice slits balance
          the layout to stay inside the scrap window. Set average coil weight and
          number of coils to see expected slit weights.
        </p>
      </div>

      {/* Coil + scrap parameters */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Thickness (mm)</Label>
          <Input className="h-8 text-xs" value={thickness} onChange={(e) => setThickness(e.target.value)} placeholder="0.75" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Coil width (mm)</Label>
          <Input className="h-8 text-xs" value={coilWidth} onChange={(e) => setCoilWidth(e.target.value)} inputMode="decimal" disabled={isMultiCoil} />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Min scrap (mm)</Label>
          <Input className="h-8 text-xs" value={minScrapMm} onChange={(e) => setMinScrapMm(e.target.value)} inputMode="decimal" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Max scrap (mm)</Label>
          <Input className="h-8 text-xs" value={maxScrapMm} onChange={(e) => setMaxScrapMm(e.target.value)} inputMode="decimal" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Knives / cutters (≤15)</Label>
          <Input className="h-8 text-xs" value={maxKnives} onChange={(e) => setMaxKnives(e.target.value)} inputMode="numeric" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Avg coil weight (kg)</Label>
          <Input
            className="h-8 text-xs"
            value={avgCoilWeight}
            onChange={(e) => setAvgCoilWeight(e.target.value)}
            inputMode="decimal"
            placeholder="10000"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Number of coils</Label>
          <div className="relative">
            <Input
              className="h-8 pr-6 text-xs"
              value={numberOfCoils}
              onChange={(e) => setNumberOfCoils(e.target.value)}
              inputMode="numeric"
              placeholder="1"
            />
            <div className="absolute inset-y-0 right-0.5 flex flex-col justify-center py-0.5">
              <button
                type="button"
                tabIndex={-1}
                onClick={() => bumpCoils(1)}
                aria-label="Increase number of coils"
                className="flex h-3.5 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ChevronUp className="h-2.5 w-2.5" />
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => bumpCoils(-1)}
                aria-label="Decrease number of coils"
                className="flex h-3.5 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ChevronDown className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Slit inputs */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Target className="h-3 w-3" /> Target slits (priority) — width, or{" "}
            <span className="font-mono">width:maxCount</span> (cap optional)
          </Label>
          <Input
            className="h-8 text-xs font-mono"
            value={targetsText}
            onChange={(e) => setTargetsText(e.target.value)}
            placeholder="149, 157:2"
          />
          <p className="text-[10px] text-muted-foreground">
            {parsedTargets.length > 0
              ? parsedTargets.map((t) => (t.max ? `${t.width}mm×≤${t.max}` : `${t.width}mm`)).join(" · ")
              : "Add at least one target — every result will contain one of these, packed at max count. Add :count to cap a width."}
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">
            Sacrifice slits (optional) — width, or{" "}
            <span className="font-mono">width:maxCount</span> (cap optional)
          </Label>
          <Input
            className="h-8 text-xs font-mono"
            value={sacrificesText}
            onChange={(e) => setSacrificesText(e.target.value)}
            placeholder="63, 79, 99, 119:2, 129"
          />
          <p className="text-[10px] text-muted-foreground">
            {parsedSacrifices.length > 0
              ? parsedSacrifices.map((t) => (t.max ? `${t.width}mm×≤${t.max}` : `${t.width}mm`)).join(" · ") +
                " — used only to fill the coil around targets."
              : "Used only to fill the coil around targets. Add :count to cap a width."}
          </p>
        </div>
      </div>

      {/* Scope + results cap */}
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Coil scope</Label>
          <Select value={coilScope} onValueChange={(v) => setCoilScope(v as "single" | "all")}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single">Single coil (uses coil width above)</SelectItem>
              <SelectItem value="all">All coils of this thickness</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Max results</Label>
          <Input className="h-8 text-xs" value={maxResults} onChange={(e) => setMaxResults(e.target.value)} inputMode="numeric" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Target machine (for approval)</Label>
          <Select value={targetMachine} onValueChange={setTargetMachine}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="null">No machine (save as draft)</SelectItem>
              {machines.data?.map((m) => (
                <SelectItem key={m.machine_id} value={m.machine_id.toString()}>
                  {m.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={run} disabled={running}>
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" /> Discover combinations
            </>
          )}
        </Button>
        {runRows && (
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={reset}>
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      {annotatedResults && annotatedResults.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium">
              {annotatedResults.length} combination{annotatedResults.length === 1 ? "" : "s"} found
              {truncated ? " (truncated — raise max results)" : ""}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {isMultiCoil
                ? `${fmtThickness(thicknessNum || 0)} mm · all coils`
                : `Coil ${fmtThickness(thicknessNum || 0)} × ${coilWidthNum || "?"} mm`}
              {targetSet.size > 0
                ? " · sorted by target match, then scrap, then knives"
                : " · sorted by scrap, then knives"}
              {avgWeightNum > 0 && ` · weights for ${numberOfCoilsNum} coil(s)`}
            </p>
          </div>
          <div className="max-h-96 overflow-auto rounded-xl border border-border/70 shadow-sm">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60 text-[10px] uppercase tracking-wide text-muted-foreground/80">
                <tr>
                  <th className="px-2 py-1 text-left">#</th>
                  {isMultiCoil && <th className="px-2 py-1 text-left">Coil</th>}
                  {targetSet.size > 0 && <th className="px-2 py-1 text-left">Target</th>}
                  <th className="px-2 py-1 text-left">Layout</th>
                  <th className="px-2 py-1 text-left">Slit weight (kg){numberOfCoilsNum > 1 ? ` × ${numberOfCoilsNum} coils` : ""}</th>
                  <th className="px-2 py-1 text-right">Knives</th>
                  <th className="px-2 py-1 text-right">Used</th>
                  <th className="px-2 py-1 text-right">Scrap</th>
                  <th className="px-2 py-1 text-right">%</th>
                  <th className="px-2 py-1 text-right">Gross (kg)</th>
                  <th className="px-2 py-1 text-left">Status</th>
                  <th className="px-2 py-1 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {(annotatedResults ?? []).map((r, i) => {
                  const isDraftSave = targetMachine === "null";
                  const promoteLabel = isDraftSave ? "Save draft" : `Approve → ${machineLabel}`;
                  const savingId = `${r.row.coilSpecId}:${r.canonicalKey}`;
                  const disableApprove =
                    !r.row.coilSpecId ||
                    savingKey === savingId ||
                    r.approved ||
                    r.existsOnMachine ||
                    (r.missingProduct && !isDraftSave);
                  const coilW = r.row.coilWidthMm;
                  let totalGross = 0;
                  for (const p of r.row.combo.picks) {
                    totalGross += grossSlitWeight(p.slit_width_mm, coilW, avgWeightNum, p.slit_count, numberOfCoilsNum);
                  }
                  return (
                    <tr key={`${r.row.coilSpecId ?? "no"}:${r.canonicalKey}`} className="border-t border-border/60 align-top transition-colors hover:bg-muted/20">
                      <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                      {isMultiCoil && <td className="px-2 py-1 tabular-nums">{coilW}</td>}
                      {targetSet.size > 0 && (
                        <td className="px-2 py-1">
                          <Badge
                            variant="outline"
                            className={
                              "px-1.5 py-0 text-[10px] font-mono " +
                              (r.distinctTargets === targetSet.size
                                ? "border-success/40 bg-success/10 text-success"
                                : r.distinctTargets > 0
                                  ? "border-secondary/40 bg-secondary/10 text-secondary"
                                  : "border-border/70 text-muted-foreground")
                            }
                            title={`${r.distinctTargets} of ${targetSet.size} target width(s) matched · ${r.targetSlitCount} target slit(s) packed`}
                          >
                            {r.distinctTargets}/{targetSet.size}
                          </Badge>
                        </td>
                      )}
                      <td className="px-2 py-1">
                        <div className="space-y-0.5">
                          {r.row.combo.picks.map((p) => {
                            const prod = productMap.data?.[p.slit_width_mm];
                            const isTarget = targetSet.has(p.slit_width_mm);
                            return (
                              <div key={p.slit_width_mm} className="flex flex-wrap items-center gap-2">
                                <span
                                  className={
                                    "tabular-nums " +
                                    (isTarget ? "rounded bg-primary/10 px-1 font-semibold text-primary" : "")
                                  }
                                >
                                  {p.slit_count}×{p.slit_width_mm}
                                </span>
                                {prod ? (
                                  <span className="font-sans text-[10px] text-muted-foreground">→ {prod.label}</span>
                                ) : (
                                  <span className="font-sans text-[10px] text-destructive">→ no product mapped</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        {avgWeightNum > 0 ? (
                          <div className="space-y-0.5">
                            {r.row.combo.picks.map((p) => {
                              const oneW = oneSlitWeight(p.slit_width_mm, coilW, avgWeightNum);
                              const grossW = grossSlitWeight(p.slit_width_mm, coilW, avgWeightNum, p.slit_count, numberOfCoilsNum);
                              return (
                                <div key={p.slit_width_mm} className="whitespace-nowrap tabular-nums">
                                  {p.slit_width_mm}mm: {oneW}kg×{p.slit_count}
                                  {numberOfCoilsNum > 1 ? `×${numberOfCoilsNum}` : ""} ={" "}
                                  <span className="font-semibold">{grossW}kg</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right">{r.row.combo.knife_count}</td>
                      <td className="px-2 py-1 text-right">{r.row.combo.total_width_mm.toFixed(1)}</td>
                      <td className="px-2 py-1 text-right">{r.row.combo.scrap_mm.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">{(r.row.combo.scrap_ratio * 100).toFixed(2)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {avgWeightNum > 0 ? totalGross : "—"}
                      </td>
                      <td className="px-2 py-1">
                        <div className="flex flex-wrap items-center gap-1">
                          {!r.row.coilSpecId ? (
                            <Badge variant="outline" className="border-warning/40 px-1.5 py-0 text-[10px] text-warning-foreground">
                              No coil spec
                            </Badge>
                          ) : r.approved ? (
                            <Badge variant="outline" className="border-success/40 bg-success/10 px-1.5 py-0 text-[10px] font-semibold text-success">
                              Combination Available
                            </Badge>
                          ) : r.exists ? (
                            <Badge variant="outline" className="border-warning/40 bg-warning/10 px-1.5 py-0 text-[10px] font-semibold text-warning-foreground">
                              Pending Approval
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-primary/40 px-1.5 py-0 text-[10px] text-primary">New</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1 text-right">
                        {canApprove ? (
                          <Button
                            size="sm"
                            variant={isDraftSave ? "secondary" : "outline"}
                            className="h-6 gap-1 px-2 text-[10px]"
                            disabled={disableApprove}
                            title={
                              !r.row.coilSpecId
                                ? "Add this coil_spec in the Coil Specs page first"
                                : r.approved
                                  ? "This combination is already approved and visible in Combinations — no need to save it again"
                                  : r.existsOnMachine
                                    ? "An identical unassigned draft already exists — approve or reject it in the queue below"
                                    : r.missingProduct && !isDraftSave
                                      ? "Map a product for every slit width before approving to a machine"
                                      : r.missingProduct && isDraftSave
                                        ? "Placeholder products will be created for unmapped slit widths"
                                        : undefined
                            }
                            onClick={() => approveOne(r.canonicalKey, r.row, r.existsOnMachine)}
                          >
                            {savingKey === savingId ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Save className="h-3 w-3" />
                            )}
                            {promoteLabel}
                          </Button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">manager only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Saved drafts appear in the approval queue below where a machine can be assigned to promote them.
          </p>
        </div>
      )}

      {runRows && runRows.length === 0 && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-[11px]">
          No layout of these widths lands between {Number(minScrapMm) || 0} mm and {Number(maxScrapMm) || 0} mm scrap.
          Widen the scrap window, add sacrifice widths, or raise the max-knives cap.
        </p>
      )}
    </div>
  );
}

