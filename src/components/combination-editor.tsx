import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchCoils, fetchSlits, fetchProducts, fetchMachines } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtThickness } from "@/lib/formula";
import type { CombinationDetail } from "@/lib/types";

type LineDraft = {
  slit_spec_id: number | null;
  product_id: number | null;
  slit_count: number;
};

export function CombinationEditor({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: CombinationDetail | null;
}) {
  const qc = useQueryClient();
  const coils = useQuery({ queryKey: ["coils"], queryFn: fetchCoils });
  const slits = useQuery({ queryKey: ["slits"], queryFn: fetchSlits });
  const products = useQuery({ queryKey: ["products"], queryFn: fetchProducts });
  const machines = useQuery({ queryKey: ["machines"], queryFn: fetchMachines });

  const [coilId, setCoilId] = useState<number | null>(null);
  const [machineId, setMachineId] = useState<number | null>(null);
  const [lines, setLines] = useState<LineDraft[]>([
    { slit_spec_id: null, product_id: null, slit_count: 1 },
  ]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setCoilId(initial.coil.spec_id);
      setLines(
        initial.lines.map((l) => ({
          slit_spec_id: l.slit.spec_id,
          product_id: l.product_id,
          slit_count: l.slit_count,
        })),
      );
    } else {
      setCoilId(null);
      setLines([{ slit_spec_id: null, product_id: null, slit_count: 1 }]);
    }
    setMachineId(null);
  }, [open, initial]);

  const coil = useMemo(
    () => coils.data?.find((c) => c.spec_id === coilId) ?? null,
    [coils.data, coilId],
  );
  const filteredSlits = useMemo(() => {
    if (!slits.data || !coil) return slits.data ?? [];
    return slits.data.filter((s) => s.thickness_mm === coil.thickness_mm);
  }, [slits.data, coil]);

  const total = lines.reduce((sum, l) => {
    const s = slits.data?.find((x) => x.spec_id === l.slit_spec_id);
    return sum + (s ? s.width_mm * (l.slit_count || 0) : 0);
  }, 0);
  const scrap = coil ? Math.max(0, coil.width_mm - total) : 0;
  const over = coil ? total > coil.width_mm : false;

  const save = useMutation({
    mutationFn: async () => {
      if (!coil) throw new Error("Select a coil");
      if (!machineId) throw new Error("Select a machine — required so this combination is immediately usable, not left as an unapproved draft");
      const ready = lines.filter(
        (l) => l.slit_spec_id != null && l.product_id != null && l.slit_count > 0,
      );
      if (!ready.length) throw new Error("Add at least one line");
      if (over) throw new Error("Total slit width exceeds coil width");

      // If editing, delete old and re-create through RPC (dedup-safe)
      if (initial) {
        const { error: delErr } = await supabase
          .from("combination")
          .delete()
          .eq("combination_id", initial.combination_id);
        if (delErr) throw delErr;
      }

      const payload = ready.map((l, i) => ({
        sequence: i + 1,
        slit_spec_id: l.slit_spec_id as number,
        product_id: l.product_id as number,
        slit_count: l.slit_count,
      }));

      const { data, error } = await supabase.rpc("upsert_combination", {
        _coil_spec_id: coil.spec_id,
        _lines: payload,
        _machine_id: (machineId ?? null) as unknown as number,
        _total_slit_width_mm: total,
        _scrap_mm: scrap,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        was_duplicate: row?.was_duplicate as boolean,
        combination_id: row?.combination_id as number,
      };
    },
    onSuccess: (res) => {
      if (res.was_duplicate) {
        toast.info("This combination already exists — usage count updated.");
      } else {
        toast.success(
          initial ? "Combination updated." : "Combination saved.",
        );
      }
      qc.invalidateQueries({ queryKey: ["all-combos"] });
      qc.invalidateQueries({ queryKey: ["combos"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            {initial ? `Edit combination #${initial.combination_id}` : "New combination"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Coil</Label>
              <Select
                value={coilId?.toString() ?? ""}
                onValueChange={(v) => setCoilId(Number(v))}
                disabled={!!initial}
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
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">
                Machine
              </Label>
              <Select
                value={machineId?.toString() ?? ""}
                onValueChange={(v) => setMachineId(v ? Number(v) : null)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select machine" />
                </SelectTrigger>
                <SelectContent>
                  {machines.data?.map((m) => (
                    <SelectItem key={m.machine_id} value={m.machine_id.toString()}>
                      {m.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border/70">
            <div className="grid grid-cols-[1fr_1fr_70px_36px] gap-1 border-b border-border/60 bg-muted/40 px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/80">
              <div>Slit</div>
              <div>Product</div>
              <div>Count</div>
              <div />
            </div>
            {lines.map((l, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_1fr_70px_36px] gap-1 border-b border-border/60 px-2 py-1.5 transition-colors last:border-b-0 hover:bg-muted/20"
              >
                <Select
                  value={l.slit_spec_id?.toString() ?? ""}
                  onValueChange={(v) =>
                    updateLine(i, { slit_spec_id: Number(v), product_id: null })
                  }
                  disabled={!coil}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Slit" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredSlits.map((s) => (
                      <SelectItem key={s.spec_id} value={s.spec_id.toString()}>
                        <span className="font-mono">
                          {fmtThickness(s.thickness_mm)} × {s.width_mm}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={l.product_id?.toString() ?? ""}
                  onValueChange={(v) => updateLine(i, { product_id: Number(v) })}
                  disabled={l.slit_spec_id == null}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.data?.map((p) => (
                      <SelectItem key={p.product_id} value={p.product_id.toString()}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="h-7 text-xs font-mono tabular-nums"
                  type="number"
                  min={1}
                  value={l.slit_count}
                  onChange={(e) =>
                    updateLine(i, { slit_count: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() =>
                    setLines((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  disabled={lines.length === 1}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { slit_spec_id: null, product_id: null, slit_count: 1 },
                  ])
                }
              >
                <Plus className="h-3 w-3" /> Add line
              </Button>
              <div className="flex items-center gap-3 text-[11px]">
                <span className={over ? "text-destructive" : "text-muted-foreground"}>
                  Total{" "}
                  <span className="font-mono font-medium tabular-nums">{total}</span>
                  {coil ? ` / ${coil.width_mm}` : ""}
                </span>
                <span className="text-muted-foreground">
                  Scrap{" "}
                  <span className="font-mono font-medium tabular-nums">
                    {scrap.toFixed(1)}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={save.isPending || !coil || !machineId || over}
            onClick={() => save.mutate()}
          >
            {initial ? "Save changes" : "Save combination"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
