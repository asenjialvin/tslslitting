import { fmtThickness } from "@/lib/formula";
import type { CombinationDetail } from "@/lib/types";

function fmtNum(n: number) {
  return Number.isInteger(n) ? n.toString() : n.toFixed(2).replace(/\.?0+$/, "");
}

function SegmentBox({
  numerator,
  denominator,
}: {
  numerator: string;
  denominator: string;
}) {
  return (
    <div className="inline-flex flex-col items-center overflow-hidden rounded-lg border border-border/70 bg-background text-[11px] shadow-sm transition-shadow hover:shadow-md">
      <div className="w-full border-b-2 border-accent px-2 py-1 text-center font-mono tabular-nums">
        {numerator}
      </div>
      <div className="w-full px-2 py-1 text-center font-medium">{denominator}</div>
    </div>
  );
}

export function FormulaBoxed({ combo }: { combo: CombinationDetail }) {
  const total =
    combo.total_slit_width_mm ??
    combo.lines.reduce((s, l) => s + l.slit.width_mm * l.slit_count, 0);
  const scrap = Math.max(0, combo.coil.width_mm - total);
  const sorted = [...combo.lines].sort((a, b) => a.sequence - b.sequence);
  return (
    <div className="flex flex-wrap items-stretch gap-1.5 text-[11px]">
      <div className="inline-flex items-center rounded-lg border border-primary/40 bg-primary/5 px-2 py-1 font-mono tabular-nums">
        {fmtThickness(combo.coil.thickness_mm)} × {fmtNum(combo.coil.width_mm)}
      </div>
      <div className="inline-flex items-center px-1 text-muted-foreground">→</div>
      {sorted.map((l, i) => (
        <div key={l.sequence} className="flex items-stretch gap-1.5">
          {i > 0 && (
            <div className="inline-flex items-center px-1 text-muted-foreground">+</div>
          )}
          <SegmentBox
            numerator={`${fmtNum(l.slit.width_mm)} × ${l.slit_count}`}
            denominator={l.product}
          />
        </div>
      ))}
      <div className="inline-flex items-center px-1 text-muted-foreground">⇒</div>
      <div className="inline-flex items-center rounded-lg border border-success/40 bg-success/10 px-2 py-1 font-mono tabular-nums text-success">
        Total {fmtNum(total)}
      </div>
      <div className="inline-flex items-center rounded-lg border border-warning/40 bg-warning/10 px-2 py-1 font-mono tabular-nums text-warning-foreground">
        Scrap {fmtNum(scrap)}
      </div>
    </div>
  );
}
