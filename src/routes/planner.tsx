import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select";
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
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchCoils,
  fetchProducts,
  fetchSlits,
  fetchCombinationsForCoil,
} from "@/lib/queries";
import { CombinationCard } from "@/components/combination-card";
import { CombinationListSkeleton } from "@/components/combination-card-skeleton";
import { fmtThickness } from "@/lib/formula";

export const Route = createFileRoute("/planner")({
  head: () => ({
    meta: [
      { title: "Combination Finder — Slitting Planner" },
      {
        name: "description",
        content:
          "Select a coil and explore possible slitting combinations for Tononoka Steels.",
      },
    ],

  }),
  component: Index,
});

const ADD_NEW = "__add_new__";

function Index() {
  const qc = useQueryClient();
  const [coilId, setCoilId] = useState<number | null>(null);
  const [slitId, setSlitId] = useState<number | null>(null);
  const [productId, setProductId] = useState<number | null>(null);
  const [showAllSlitThicknesses, setShowAllSlitThicknesses] = useState(false);
  const [addSlitOpen, setAddSlitOpen] = useState(false);
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [newSlitWidth, setNewSlitWidth] = useState("");
  const [newProductLabel, setNewProductLabel] = useState("");

  const coils = useQuery({ queryKey: ["coils"], queryFn: fetchCoils });
  const slits = useQuery({ queryKey: ["slits"], queryFn: fetchSlits });
  const products = useQuery({ queryKey: ["products"], queryFn: fetchProducts });
  const combos = useQuery({
    enabled: coilId != null,
    queryKey: ["combos", coilId, slitId, productId],
    queryFn: () =>
      fetchCombinationsForCoil(coilId!, { slitSpecId: slitId, productId }),
  });

  const coil = useMemo(
    () => coils.data?.find((c) => c.spec_id === coilId) ?? null,
    [coils.data, coilId],
  );

  // Products linked to the currently-selected slit via slit_product_map.
  const slitProducts = useQuery({
    enabled: slitId != null,
    queryKey: ["slit-products", slitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slit_product_map")
        .select("product_id")
        .eq("slit_spec_id", slitId!);
      if (error) throw error;
      return new Set(data.map((r) => r.product_id));
    },
  });

  const filteredSlits = useMemo(() => {
    if (!slits.data) return [];
    if (!coil || showAllSlitThicknesses) return slits.data;
    return slits.data.filter((s) => s.thickness_mm === coil.thickness_mm);
  }, [slits.data, coil, showAllSlitThicknesses]);

  const filteredProducts = useMemo(() => {
    if (!products.data) return [];
    if (slitId == null || !slitProducts.data) return products.data;
    const allow = slitProducts.data;
    return products.data.filter((p) => allow.has(p.product_id));
  }, [products.data, slitId, slitProducts.data]);

  const addSlit = useMutation({
    mutationFn: async () => {
      if (!coil) throw new Error("Select a coil first");
      const width = parseFloat(newSlitWidth);
      if (!(width > 0)) throw new Error("Enter a positive width");
      const { data, error } = await supabase
        .from("slit_spec")
        .insert({
          thickness_mm: coil.thickness_mm,
          width_mm: width,
          source: "manual",
        })
        .select("spec_id")
        .single();
      if (error) throw error;
      // Auto-link to current coil spec so it appears normally in future dropdowns.
      await supabase
        .from("coil_slit_map")
        .upsert(
          { coil_spec_id: coil.spec_id, slit_spec_id: data.spec_id },
          { onConflict: "coil_spec_id,slit_spec_id" },
        );
      return data.spec_id as number;
    },
    onSuccess: (id) => {
      toast.success("Slit size added");
      qc.invalidateQueries({ queryKey: ["slits"] });
      setSlitId(id);
      setProductId(null);
      setNewSlitWidth("");
      setAddSlitOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addProduct = useMutation({
    mutationFn: async () => {
      const label = newProductLabel.trim();
      if (!label) throw new Error("Enter a label");
      const { data, error } = await supabase
        .from("product")
        .insert({ label })
        .select("product_id")
        .single();
      if (error) throw error;
      if (slitId != null) {
        await supabase
          .from("slit_product_map")
          .upsert(
            { slit_spec_id: slitId, product_id: data.product_id },
            { onConflict: "slit_spec_id,product_id" },
          );
      }
      return data.product_id as number;
    },
    onSuccess: (id) => {
      toast.success("Product added");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["slit-products", slitId] });
      setProductId(id);
      setNewProductLabel("");
      setAddProductOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onCoil = (v: string) => {
    setCoilId(Number(v));
    setSlitId(null);
    setProductId(null);
    setShowAllSlitThicknesses(false);
  };

  const onSlit = (v: string) => {
    if (v === ADD_NEW) {
      setAddSlitOpen(true);
      return;
    }
    setSlitId(v ? Number(v) : null);
    setProductId(null);
  };

  const onProduct = (v: string) => {
    if (v === ADD_NEW) {
      setAddProductOpen(true);
      return;
    }
    setProductId(v ? Number(v) : null);
  };

  return (
    <div className="px-3 py-4 space-y-4 sm:px-4">
      <div className="rounded-xl border border-border/70 bg-card shadow-sm p-3">
        <h1 className="text-base font-semibold tracking-tight sm:text-lg">Combination Finder</h1>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Look up known slitting layouts for a coil size — this doesn't create a
          production plan. To schedule a run, open a plan under{" "}
          <Link to="/plans" className="text-primary underline-offset-2 hover:underline">
            Plans
          </Link>
          .
        </p>
        <div className="grid gap-2 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground/80">
              Coil (T × W mm)
            </label>
            <Select value={coilId?.toString() ?? ""} onValueChange={onCoil}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={coils.isLoading ? "Loading…" : "Select coil"} />
              </SelectTrigger>
              <SelectContent>
                {coils.data?.map((c) => (
                  <SelectItem key={c.spec_id} value={c.spec_id.toString()}>
                    <span className="font-mono">{fmtThickness(c.thickness_mm)} × {c.width_mm}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-[10px] uppercase tracking-wide text-muted-foreground/80">
                Slit (optional)
              </label>
              {coil && (
                <button
                  type="button"
                  className="text-[10px] text-primary hover:underline disabled:opacity-40"
                  onClick={() => setShowAllSlitThicknesses((v) => !v)}
                >
                  {showAllSlitThicknesses
                    ? `only ${fmtThickness(coil.thickness_mm)}mm`
                    : "show other thicknesses"}
                </button>
              )}
            </div>
            <Select
              value={slitId?.toString() ?? ""}
              onValueChange={onSlit}
              disabled={coilId == null}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Any slit" />
              </SelectTrigger>
              <SelectContent>
                {filteredSlits.map((s) => (
                  <SelectItem key={s.spec_id} value={s.spec_id.toString()}>
                    <span className="font-mono">{fmtThickness(s.thickness_mm)} × {s.width_mm}</span>
                  </SelectItem>
                ))}
                {coil && (
                  <>
                    <SelectSeparator />
                    <SelectItem value={ADD_NEW} className="text-primary">
                      + Add new slit size
                    </SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground/80">
              Product (optional)
            </label>
            <Select
              value={productId?.toString() ?? ""}
              onValueChange={onProduct}
              disabled={coilId == null}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue
                  placeholder={slitId != null ? "Products for this slit" : "Any product"}
                />
              </SelectTrigger>
              <SelectContent>
                {filteredProducts.map((p) => (
                  <SelectItem key={p.product_id} value={p.product_id.toString()}>
                    {p.label}
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value={ADD_NEW} className="text-primary">
                  + Add new product
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {(slitId != null || productId != null) && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-7 text-xs"
            onClick={() => {
              setSlitId(null);
              setProductId(null);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {coilId == null ? (
        <p className="py-12 text-center text-xs text-muted-foreground">
          Select a coil size to see possible slitting combinations.
        </p>
      ) : combos.isLoading ? (
        <CombinationListSkeleton />
      ) : (combos.data?.length ?? 0) === 0 ? (
        <p className="py-12 text-center text-xs text-muted-foreground">
          No combinations match the current filters.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {combos.data!.length} combination{combos.data!.length === 1 ? "" : "s"} found
          </p>
          {[...combos.data!]
            .sort(
              (a, b) =>
                b.lines.reduce((s, l) => s + l.slit_count, 0) -
                a.lines.reduce((s, l) => s + l.slit_count, 0),
            )
            .map((c) => (
              <CombinationCard
                key={c.combination_id}
                combo={c}
                highlightSlitSpecId={slitId}
                highlightProductId={productId}
              />
            ))}
        </div>
      )}

      <Dialog open={addSlitOpen} onOpenChange={setAddSlitOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Add new slit size</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">
                Thickness (locked to coil)
              </Label>
              <Input
                className="h-8 text-xs"
                value={coil ? fmtThickness(coil.thickness_mm) : ""}
                disabled
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">
                Width (mm)
              </Label>
              <Input
                className="h-8 text-xs"
                type="number"
                inputMode="decimal"
                step="0.1"
                value={newSlitWidth}
                onChange={(e) => setNewSlitWidth(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => setAddSlitOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={addSlit.isPending}
              onClick={() => addSlit.mutate()}
            >
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addProductOpen} onOpenChange={setAddProductOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Add new product</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Label</Label>
              <Input
                className="h-8 text-xs"
                value={newProductLabel}
                onChange={(e) => setNewProductLabel(e.target.value)}
                autoFocus
              />
            </div>
            {slitId != null && (
              <p className="text-[10px] text-muted-foreground">
                Will be linked to the selected slit size.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => setAddProductOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={addProduct.isPending}
              onClick={() => addProduct.mutate()}
            >
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
