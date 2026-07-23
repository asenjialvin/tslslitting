import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAllCombinations } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { CombinationCard } from "@/components/combination-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Trash2, Pencil, Plus } from "lucide-react";
import { CombinationEditor } from "@/components/combination-editor";
import { CombinationListSkeleton } from "@/components/combination-card-skeleton";
import type { CombinationDetail } from "@/lib/types";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/combinations")({
  head: () => ({ meta: [{ title: "Combinations — Slitting Planner" }] }),
  component: Combinations,
});

function Combinations() {
  const { hasAtLeast } = useAuth();
  const canEdit = hasAtLeast("manager");
  const qc = useQueryClient();
  const [machine, setMachine] = useState<string>("");
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CombinationDetail | null>(null);
  const combos = useQuery({
    queryKey: ["all-combos", machine || null],
    queryFn: () => fetchAllCombinations(machine || null),
  });
  const del = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("combination")
        .delete()
        .eq("combination_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["all-combos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = search.trim().toLowerCase();
  const isIdQuery = s.startsWith("#");
  const idNeedle = isIdQuery ? s.slice(1).trim() : "";
  const filtered = (combos.data ?? []).filter((c) => {
    if (!s) return true;
    const idStr = String(c.combination_id);
    // "#100" (or "#10" etc.) looks up the combination identifier specifically.
    if (isIdQuery) return idNeedle !== "" && idStr.includes(idNeedle);
    // An exact numeric match against the ID is always honored even without
    // the "#" prefix, alongside coil/slit/product matches below.
    if (idStr === s) return true;
    if (`${c.coil.thickness_mm}×${c.coil.width_mm}`.toLowerCase().includes(s)) return true;
    if (String(c.coil.width_mm).includes(s)) return true;
    if (String(c.coil.thickness_mm).includes(s)) return true;
    if (c.lines.some((l) => l.product.toLowerCase().includes(s))) return true;
    if (c.lines.some((l) => String(l.slit.width_mm).includes(s))) return true;
    return false;
  });

  return (
    <div className="px-3 py-4 space-y-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight sm:text-lg">Combinations library</h1>
          <p className="text-xs text-muted-foreground">Saved coil-to-product slitting layouts</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {filtered.length} of {combos.data?.length ?? 0}
          </div>
          {canEdit && (
            <Button
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> New combination
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card p-2.5 shadow-sm">
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
          {[
            { code: "", label: "All" },
            { code: "GMT", label: "GMT" },
            { code: "25T", label: "25T" },
          ].map((m) => (
            <Button
              key={m.label}
              size="sm"
              variant={machine === m.code ? "default" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setMachine(m.code)}
            >
              {m.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Input
            className="h-8 max-w-xs text-xs"
            placeholder="Search coil, slit, product, or #id…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search.trim() && (
            <p className="text-[10px] text-muted-foreground">
              {isIdQuery
                ? `Looking up combination IDs containing "${idNeedle || "…"}"`
                : "Matches coil size, slit width, product, or exact combination ID"}
            </p>
          )}
        </div>
      </div>
      {combos.isLoading ? (
        <CombinationListSkeleton />
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <CombinationCard
              key={c.combination_id}
              combo={c}
              right={
                canEdit ? (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => {
                        setEditing(c);
                        setEditorOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive"
                      onClick={() => {
                        if (confirm(`Delete combination #${c.combination_id}?`))
                          del.mutate(c.combination_id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : undefined
              }
            />
          ))}
        </div>
      )}
      <CombinationEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initial={editing}
      />
    </div>
  );
}
