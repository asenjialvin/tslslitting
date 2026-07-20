import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ListChecks, Save, Trash2, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchCoils,
  fetchCombinationsForCoil,
  fetchPlanDetail,
} from "@/lib/queries";
import { suggestCombination, type Suggestion } from "@/lib/heuristic";
import { fmtThickness } from "@/lib/formula";
import { CombinationCard } from "@/components/combination-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import type { CombinationDetail } from "@/lib/types";

type Mode = "existing" | "suggest";

export function PlanLineEditor({
  planId,
  lineId,
}: {
  planId: number;
  lineId?: number;
}) {
  const isEdit = lineId != null;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasAtLeast } = useAuth();

  const detail = useQuery({
    queryKey: ["plan-detail", planId],
    queryFn: () => fetchPlanDetail(planId),
  });
  const coils = useQuery({ queryKey: ["coils"], queryFn: fetchCoils });

  const existingLine = useMemo(
    () => detail.data?.lines.find((l) => l.plan_line_id === lineId) ?? null,
    [detail.data, lineId],
  );

  const [coilId, setCoilId] = useState<number | null>(null);
  const [noOfCoils, setNoOfCoils] = useState("1");
  const [sequence, setSequence] = useState<string>("");
  const [mode, setMode] = useState<Mode>("existing");
  const [pickedExisting, setPickedExisting] = useState<CombinationDetail | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  // Hydrate edit mode once
  useEffect(() => {
    if (!isEdit || !existingLine) return;
    setCoilId(existingLine.combination.coil.spec_id);
    setNoOfCoils(String(existingLine.no_of_coils));
    setSequence(String(existingLine.sequence));
    setPickedExisting(existingLine.combination);
    setMode("existing");
  }, [isEdit, existingLine]);

  const coil = useMemo(
    () => coils.data?.find((c) => c.spec_id === coilId) ?? null,
    [coils.data, coilId],
  );

  const existingCombos = useQuery({
    enabled: coilId != null,
    queryKey: ["combos-for-coil", coilId],
    queryFn: () => fetchCombinationsForCoil(coilId!),
  });

  const plan = detail.data?.plan;
  const status = plan?.status ?? "draft";
  const readOnly =
    !hasAtLeast("manager") || (isEdit ? status !== "draft" : status !== "draft");

  const runSuggestion = async () => {
    if (!coil) return;
    setSuggesting(true);
    setPickedExisting(null);
    try {
      const s = await suggestCombination(coil.thickness_mm, coil.width_mm);
      if (!s) {
        toast.error(
          "Couldn't find a workable combination — try picking an existing one or open the Combinations library.",
        );
        return;
      }
      setSuggestion(s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Heuristic failed");
    } finally {
      setSuggesting(false);
    }
  };

  const goBack = () =>
    navigate({ to: "/plans/$planId", params: { planId: String(planId) } });

  const save = useMutation({
    mutationFn: async () => {
      if (!coil) throw new Error("Pick a coil first");
      const coils_n = parseInt(noOfCoils, 10);
      if (!(coils_n > 0)) throw new Error("Enter a valid coil count");
      const source: CombinationDetail | null =
        mode === "existing" ? pickedExisting : null;
      if (mode === "existing" && !source)
        throw new Error("Pick a combination or generate a suggestion");
      if (mode === "suggest" && !suggestion)
        throw new Error("Generate a suggestion first");

      let combinationId: number;
      let wasDuplicate = false;

      if (source) {
        combinationId = source.combination_id;
        wasDuplicate = true;
      } else {
        const lines = suggestion!.lines.map((l, i) => ({
          sequence: i + 1,
          slit_spec_id: l.slit_spec_id,
          product_id: l.product_id,
          slit_count: l.slit_count,
        }));
        const { data, error } = await supabase.rpc("upsert_combination", {
          _coil_spec_id: coil.spec_id,
          _lines: lines,
          _machine_id: (plan?.machine?.machine_id ?? null) as unknown as number,
          _total_slit_width_mm: suggestion!.total_width_mm,
          _scrap_mm: suggestion!.scrap_mm,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        combinationId = row?.combination_id as number;
        wasDuplicate = row?.was_duplicate as boolean;
      }

      const seqN = parseInt(sequence, 10);
      const nextSeq =
        Number.isFinite(seqN) && seqN > 0
          ? seqN
          : (detail.data?.lines.length ?? 0) + 1;

      if (isEdit && lineId != null) {
        const { error } = await supabase
          .from("plan_line")
          .update({
            combination_id: combinationId,
            coil_spec_id: coil.spec_id,
            no_of_coils: coils_n,
            sequence: nextSeq,
          })
          .eq("plan_line_id", lineId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("plan_line").insert({
          plan_id: planId,
          combination_id: combinationId,
          coil_spec_id: coil.spec_id,
          no_of_coils: coils_n,
          sequence: nextSeq,
        });
        if (error) throw error;
      }
      return wasDuplicate;
    },
    onSuccess: (wasDuplicate) => {
      toast.success(
        isEdit
          ? "Line updated."
          : wasDuplicate
            ? "Line added — reused an existing combination."
            : "Line added with a new combination.",
      );
      qc.invalidateQueries({ queryKey: ["plan-detail", planId] });
      qc.invalidateQueries({ queryKey: ["plans"] });
      goBack();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!lineId) return;
      const { error } = await supabase
        .from("plan_line")
        .delete()
        .eq("plan_line_id", lineId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Line removed");
      qc.invalidateQueries({ queryKey: ["plan-detail", planId] });
      goBack();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const draftCombo: CombinationDetail | null =
    mode === "suggest" && suggestion && coil
      ? {
          combination_id: -1,
          is_approved: false,
          scrap_mm: coil.width_mm - suggestion.total_width_mm,
          coil: {
            spec_id: coil.spec_id,
            thickness_mm: coil.thickness_mm,
            width_mm: coil.width_mm,
          },
          total_slit_width_mm: suggestion.total_width_mm,
          no_of_coils_typical: null,
          machines: [],
          lines: suggestion.lines.map((l, i) => ({
            sequence: i + 1,
            slit: {
              spec_id: l.slit_spec_id,
              thickness_mm: coil.thickness_mm,
              width_mm: l.slit_width_mm,
            },
            product: l.product_label,
            product_id: l.product_id,
            slit_count: l.slit_count,
          })),
        }
      : null;

  const preview: CombinationDetail | null =
    mode === "existing" ? pickedExisting : draftCombo;

  const totalWidth = preview?.total_slit_width_mm ?? 0;
  const scrap = preview && coil ? Math.max(0, coil.width_mm - totalWidth) : 0;
  const scrapPct = preview && coil ? (scrap / coil.width_mm) * 100 : 0;

  if (detail.isLoading) {
    return <p className="p-6 text-xs text-muted-foreground">Loading plan…</p>;
  }
  if (!detail.data) {
    return <p className="p-6 text-xs text-muted-foreground">Plan not found.</p>;
  }
  if (isEdit && !existingLine) {
    return (
      <p className="p-6 text-xs text-muted-foreground">Plan line not found.</p>
    );
  }

  return (
    <div className="px-3 py-3 pb-24 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={goBack}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to plan
          </Button>
          <h1 className="mt-1 text-sm font-semibold tracking-tight">
            {isEdit ? "Edit plan line" : "Add coil to plan"}
          </h1>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono">{plan?.plan_number}</span>
            <Badge variant="secondary" className="text-[10px]">
              {plan?.machine?.code ?? "—"}
            </Badge>
            <span className="capitalize">{status.replace("_", " ")}</span>
          </div>
        </div>
        {isEdit && !readOnly && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs text-destructive"
            onClick={() => {
              if (confirm("Remove this line from the plan?")) remove.mutate();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete line
          </Button>
        )}
      </div>

      {readOnly && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning-foreground">
          This plan is <span className="capitalize">{status.replace("_", " ")}</span> —
          lines can't be changed. Only draft plans are editable.
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,320px)_1fr]">
        {/* LEFT: line meta */}
        <div className="space-y-2 rounded-md border bg-card p-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Line
          </h2>
          <div>
            <label className="mb-1 block text-[10px] uppercase text-muted-foreground">
              Coil size
            </label>
            <Select
              value={coilId?.toString() ?? ""}
              onValueChange={(v) => {
                setCoilId(Number(v));
                setPickedExisting(null);
                setSuggestion(null);
              }}
              disabled={readOnly || isEdit}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select coil" />
              </SelectTrigger>
              <SelectContent>
                {coils.data?.map((c) => (
                  <SelectItem key={c.spec_id} value={c.spec_id.toString()}>
                    <span className="font-mono">
                      {fmtThickness(c.thickness_mm)} × {c.width_mm}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isEdit && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                Coil size is locked on edit. Delete + re-add to change.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] uppercase text-muted-foreground">
                No. of coils
              </label>
              <Input
                className="h-8 text-xs"
                type="number"
                min={1}
                value={noOfCoils}
                onChange={(e) => setNoOfCoils(e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase text-muted-foreground">
                Sequence
              </label>
              <Input
                className="h-8 text-xs"
                type="number"
                min={1}
                placeholder="auto"
                value={sequence}
                onChange={(e) => setSequence(e.target.value)}
                disabled={readOnly}
              />
            </div>
          </div>
          {preview && coil && (
            <div className="rounded-md border bg-background p-2 text-[11px]">
              <div className="mb-1 font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
                Selection summary
              </div>
              <div className="flex justify-between">
                <span>Total width</span>
                <span className="font-mono tabular-nums">{totalWidth} mm</span>
              </div>
              <div className="flex justify-between">
                <span>Scrap</span>
                <span
                  className={`font-mono tabular-nums ${scrapPct > 2 ? "text-destructive" : "text-success"}`}
                >
                  {scrap.toFixed(1)} mm · {scrapPct.toFixed(2)}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: combination picker */}
        <div className="rounded-md border bg-card">
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <div className="border-b px-3 py-2">
              <TabsList className="h-8">
                <TabsTrigger value="existing" className="text-xs">
                  <ListChecks className="mr-1 h-3.5 w-3.5" /> Existing
                </TabsTrigger>
                <TabsTrigger value="suggest" className="text-xs">
                  <Wand2 className="mr-1 h-3.5 w-3.5" /> Suggest new
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="existing" className="m-0 p-3">
              {!coil ? (
                <p className="py-6 text-center text-[11px] text-muted-foreground">
                  Pick a coil size to see known combinations.
                </p>
              ) : existingCombos.isLoading ? (
                <p className="text-[11px] text-muted-foreground">Loading…</p>
              ) : existingCombos.data && existingCombos.data.length > 0 ? (
                <div className="max-h-[60vh] space-y-1.5 overflow-auto">
                  {existingCombos.data.map((c) => (
                    <button
                      key={c.combination_id}
                      type="button"
                      onClick={() => !readOnly && setPickedExisting(c)}
                      disabled={readOnly}
                      className={`w-full rounded-md border text-left transition-colors ${
                        pickedExisting?.combination_id === c.combination_id
                          ? "border-primary ring-1 ring-primary"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <CombinationCard combo={c} />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border bg-muted/30 p-2 text-[11px] text-muted-foreground">
                  No known combinations for this coil size — try the
                  <span className="mx-1 font-medium">Suggest new</span>tab.
                </p>
              )}
            </TabsContent>

            <TabsContent value="suggest" className="m-0 space-y-3 p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  Runs the greedy heuristic against your slit library. Draft is
                  editable — save creates the combination and links it.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  onClick={runSuggestion}
                  disabled={!coil || suggesting || readOnly}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  {suggesting ? "Thinking…" : "Generate"}
                </Button>
              </div>
              {draftCombo ? (
                <CombinationCard combo={draftCombo} />
              ) : (
                <p className="py-6 text-center text-[11px] text-muted-foreground">
                  {coil
                    ? "No suggestion yet — click Generate."
                    : "Pick a coil size first."}
                </p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2">
          <div className="text-[11px] text-muted-foreground">
            {preview && coil ? (
              <>
                <span className="font-mono">
                  {fmtThickness(coil.thickness_mm)} × {coil.width_mm}
                </span>{" "}
                → total <span className="font-mono">{totalWidth}</span> · scrap{" "}
                <span
                  className={`font-mono ${scrapPct > 2 ? "text-destructive" : "text-success"}`}
                >
                  {scrap.toFixed(1)} mm ({scrapPct.toFixed(2)}%)
                </span>
              </>
            ) : (
              <span>Pick a coil and a combination to continue.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={goBack}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1 text-xs"
              disabled={
                readOnly ||
                !coil ||
                (mode === "existing" ? !pickedExisting : !suggestion) ||
                save.isPending
              }
              onClick={() => save.mutate()}
            >
              <Save className="h-3.5 w-3.5" />
              {isEdit ? "Save changes" : "Add to plan"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
