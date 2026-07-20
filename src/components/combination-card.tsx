import { Badge } from "@/components/ui/badge";
import { fmtThickness } from "@/lib/formula";
import { FormulaBoxed } from "@/components/segment-box";
import { cn } from "@/lib/utils";
import type { CombinationDetail } from "@/lib/types";

export function CombinationCard({
  combo,
  right,
  highlightSlitSpecId,
  highlightProductId,
}: {
  combo: CombinationDetail;
  right?: React.ReactNode;
  highlightSlitSpecId?: number | null;
  highlightProductId?: number | null;
}) {
  const total = combo.total_slit_width_mm ?? 0;
  const scrap = Math.max(0, combo.coil.width_mm - total);
  return (
    <div className="rounded-md border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">
            #{combo.combination_id}
          </span>
          {combo.machines.map((m) => (
            <Badge key={m.code} variant="secondary" className="text-[10px] px-1.5 py-0">
              {m.code} · {m.frequency}×
            </Badge>
          ))}
          <span className="text-xs text-muted-foreground">
            Coil <span className="font-mono">{fmtThickness(combo.coil.thickness_mm)}×{combo.coil.width_mm}</span>mm
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>
            Total <span className="font-medium text-foreground">{total}</span>/
            {combo.coil.width_mm}
          </span>
          <span>
            Scrap <span className="font-medium text-foreground">{scrap.toFixed(1)}</span>
          </span>
          {right}
        </div>
      </div>
      <div className="px-3 py-3">
        <FormulaBoxed combo={combo} />
      </div>
      <div className="border-t">
        <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-1.5 text-left font-medium">Slit</th>
                <th className="px-3 py-1.5 text-left font-medium">Count</th>
                <th className="px-3 py-1.5 text-left font-medium">Product</th>
              </tr>
            </thead>
            <tbody>
              {combo.lines.map((l) => {
                const slitHit =
                  highlightSlitSpecId != null && l.slit.spec_id === highlightSlitSpecId;
                const productHit =
                  highlightProductId != null && l.product_id === highlightProductId;
                const hit = slitHit || productHit;
                return (
                  <tr
                    key={l.sequence}
                    className={cn(
                      "border-b last:border-0",
                      hit && "bg-primary/10",
                    )}
                  >
                    <td
                      className={cn(
                        "px-3 py-1.5 font-mono tabular-nums",
                        slitHit && "font-semibold text-primary",
                      )}
                    >
                      {fmtThickness(l.slit.thickness_mm)} × {l.slit.width_mm}
                    </td>
                    <td className="px-3 py-1.5 font-mono tabular-nums">×{l.slit_count}</td>
                    <td
                      className={cn(
                        "px-3 py-1.5 font-medium",
                        productHit && "text-primary",
                      )}
                    >
                      {l.product}
                    </td>
                  </tr>
                );
              })}
            </tbody>
        </table>
      </div>
    </div>
  );
}
