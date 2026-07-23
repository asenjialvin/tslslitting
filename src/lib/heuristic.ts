import { supabase } from "@/integrations/supabase/client";

export type SuggestedLine = {
  slit_spec_id: number;
  slit_width_mm: number;
  slit_count: number;
  product_id: number;
  product_label: string;
};

export type Suggestion = {
  lines: SuggestedLine[];
  total_width_mm: number;
  scrap_mm: number;
};

const SCRAP_TOLERANCE_RATIO = 0.02; // stop once remaining width is within ~2% of coil width

export type EnumeratedCombination = {
  picks: { slit_width_mm: number; slit_count: number }[];
  total_width_mm: number;
  scrap_mm: number;
  scrap_ratio: number;
  knife_count: number;
  structural_key: string;
};

/**
 * Exhaustive combination discovery: enumerate every non-negative integer mix
 * of the given slit widths that fits in the coil AND whose leftover scrap
 * falls within [minScrapMm, maxScrapMm]. Used by the Bulk Lab's ad-hoc panel
 * to surface layouts the greedy seeds don't find. Depth-first with pruning;
 * capped by maxKnives and maxResults so pathological inputs can't hang the UI.
 */
export function enumerateAllCombinations(
  availableWidths: number[],
  coilWidthMm: number,
  opts: {
    minScrapMm: number;
    maxScrapMm: number;
    maxKnives?: number;
    maxResults?: number;
    /** If provided, only keep combos that include ≥minTargetHits of at least one of these widths. */
    targetWidths?: number[];
    /** Minimum number of *distinct* target widths that must appear (each ≥1). Default 1. */
    minTargetHits?: number;
    /** Per-width upper bound on knife count (e.g. target max counts). Widths not
     *  listed are only bounded by maxKnives and geometry. */
    widthMaxCounts?: Record<number, number>;
  },
): { results: EnumeratedCombination[]; truncated: boolean } {
  const widths = [...new Set(availableWidths)]
    .filter((w) => w > 0)
    .sort((a, b) => b - a); // descending → better pruning
  const maxKnives = opts.maxKnives ?? 200;
  const maxResults = opts.maxResults ?? 500;
  const targetSet = opts.targetWidths && opts.targetWidths.length > 0
    ? new Set(opts.targetWidths.filter((w) => w > 0))
    : null;
  const caps = opts.widthMaxCounts ?? {};
  const isTargetIdx = targetSet ? widths.map((w) => targetSet.has(w)) : null;
  const lastTargetIdx = isTargetIdx ? isTargetIdx.lastIndexOf(true) : -1;
  const results: EnumeratedCombination[] = [];
  let truncated = false;
  if (widths.length === 0 || coilWidthMm <= 0) return { results, truncated };
  const totalTargets = isTargetIdx ? isTargetIdx.filter(Boolean).length : 0;
  const minHits = Math.max(1, Math.min(opts.minTargetHits ?? 1, totalTargets || 1));
  if (targetSet && (lastTargetIdx < 0 || totalTargets < minHits)) return { results, truncated };

  const smallest = widths[widths.length - 1];
  const counts = new Array<number>(widths.length).fill(0);

  const recurse = (idx: number, remaining: number, knives: number, targetHits: number, remainingTargetIdxs: number): void => {
    if (results.length >= maxResults) {
      truncated = true;
      return;
    }
    if (isTargetIdx && targetHits + remainingTargetIdxs < minHits) return;
    if (remaining - opts.maxScrapMm > 0 && remaining < smallest) return;

    if (idx === widths.length) {
      const scrap = remaining;
      if (
        knives > 0 &&
        (!isTargetIdx || targetHits >= minHits) &&
        scrap >= opts.minScrapMm - 1e-9 &&
        scrap <= opts.maxScrapMm + 1e-9
      ) {
        const picks = widths
          .map((w, i) => ({ slit_width_mm: w, slit_count: counts[i] }))
          .filter((p) => p.slit_count > 0)
          .sort((a, b) => b.slit_width_mm - a.slit_width_mm);
        const key = picks.map((p) => `${p.slit_width_mm}x${p.slit_count}`).join("+");
        results.push({
          picks,
          total_width_mm: coilWidthMm - scrap,
          scrap_mm: scrap,
          scrap_ratio: coilWidthMm > 0 ? scrap / coilWidthMm : 0,
          knife_count: knives,
          structural_key: key,
        });
      }
      return;
    }

    const w = widths[idx];
    const isTarget = isTargetIdx ? isTargetIdx[idx] : false;
    const geomCap = Math.floor(remaining / w);
    const knifeCap = maxKnives - knives;
    const userCap = caps[w] ?? Infinity;
    const maxC = Math.min(geomCap, knifeCap, userCap);
    for (let c = maxC; c >= 0; c--) {
      counts[idx] = c;
      recurse(idx + 1, remaining - c * w, knives + c, targetHits + (isTarget && c > 0 ? 1 : 0), remainingTargetIdxs - (isTarget ? 1 : 0));
      if (results.length >= maxResults) {
        truncated = true;
        break;
      }
    }
    counts[idx] = 0;
  };

  recurse(0, coilWidthMm, 0, 0, totalTargets);

  results.sort(
    (a, b) => a.scrap_mm - b.scrap_mm || a.knife_count - b.knife_count,
  );
  return { results, truncated };
}

/**
 * Greedy v1: sort available slit widths (at the coil's thickness) largest to
 * smallest, pack as many of the largest as fit, then move to the next size
 * down, repeating until remaining width is below the smallest slit or within
 * tolerance. For slit widths with multiple linked products, default to the
 * most historically-observed one. This never auto-saves — callers should
 * present the result for a planner to review/adjust before committing it
 * through the normal upsert_combination dedup flow.
 */
export type Candidate = {
  seed: "forward-greedy" | "decremented-large-bias" | "inverted-greedy";
  picks: { slit_width_mm: number; slit_count: number }[];
  total_width_mm: number;
  scrap_mm: number;
  knife_count: number;
  structural_key: string;
};

function packForward(widths: number[], coilWidth: number, tolerance: number) {
  let remaining = coilWidth;
  const picked: { slit_width_mm: number; slit_count: number }[] = [];
  for (const w of widths) {
    if (remaining < w) continue;
    if (remaining <= tolerance) break;
    const count = Math.floor(remaining / w);
    if (count <= 0) continue;
    picked.push({ slit_width_mm: w, slit_count: count });
    remaining -= w * count;
    if (remaining <= tolerance) break;
  }
  return picked;
}

/** Same as forward greedy, but takes one fewer of the largest slit (if it took >1),
 *  leaving structural room for a different mix of the remaining sizes — this is what
 *  surfaces genuinely different layouts rather than the same one every time. */
function packDecrementedLargeBias(widths: number[], coilWidth: number, tolerance: number) {
  if (widths.length === 0) return [];
  const largest = widths[0];
  const maxCount = Math.floor(coilWidth / largest);
  if (maxCount <= 1) return packForward(widths, coilWidth, tolerance);
  const reducedCount = maxCount - 1;
  let remaining = coilWidth - largest * reducedCount;
  const picked: { slit_width_mm: number; slit_count: number }[] = [
    { slit_width_mm: largest, slit_count: reducedCount },
  ];
  for (const w of widths.slice(1)) {
    if (remaining < w) continue;
    if (remaining <= tolerance) break;
    const count = Math.floor(remaining / w);
    if (count <= 0) continue;
    picked.push({ slit_width_mm: w, slit_count: count });
    remaining -= w * count;
    if (remaining <= tolerance) break;
  }
  return picked;
}

/** Packs smallest-first — good for hoop-heavy / small-component coils where forward
 *  greedy's "biggest first" bias leaves an awkward, hard-to-fill remainder. */
function packInverted(widths: number[], coilWidth: number, tolerance: number) {
  const ascending = [...widths].sort((a, b) => a - b);
  return packForward(ascending, coilWidth, tolerance);
}

function structuralKey(picks: { slit_width_mm: number; slit_count: number }[]): string {
  return picks
    .slice()
    .sort((a, b) => a.slit_width_mm - b.slit_width_mm)
    .map((p) => `${p.slit_width_mm}x${p.slit_count}`)
    .join("+");
}

/**
 * Multi-seed candidate generation for the Bulk Lab: runs three packing strategies
 * per coil, keeps only candidates within the scrap tolerance, and dedupes identical
 * layouts (e.g. if two seeds happen to converge on the same picks) by structural key.
 */
export function generateCandidates(
  availableWidths: number[],
  coilWidthMm: number,
  toleranceRatio = SCRAP_TOLERANCE_RATIO,
): Candidate[] {
  const widths = [...new Set(availableWidths)].sort((a, b) => b - a); // descending
  if (widths.length === 0) return [];
  const tolerance = coilWidthMm * toleranceRatio;

  const seeds: [Candidate["seed"], { slit_width_mm: number; slit_count: number }[]][] = [
    ["forward-greedy", packForward(widths, coilWidthMm, tolerance)],
    ["decremented-large-bias", packDecrementedLargeBias(widths, coilWidthMm, tolerance)],
    ["inverted-greedy", packInverted(widths, coilWidthMm, tolerance)],
  ];

  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const [seed, picks] of seeds) {
    if (picks.length === 0) continue;
    const total = picks.reduce((s, p) => s + p.slit_width_mm * p.slit_count, 0);
    const scrap = Math.max(0, coilWidthMm - total);
    if (scrap > tolerance) continue; // strict scrap gate
    const key = structuralKey(picks);
    if (seen.has(key)) continue; // structural-uniqueness dedup across seeds
    seen.add(key);
    candidates.push({
      seed,
      picks,
      total_width_mm: total,
      scrap_mm: scrap,
      knife_count: picks.reduce((s, p) => s + p.slit_count, 0),
      structural_key: key,
    });
  }
  return candidates.sort((a, b) => a.scrap_mm - b.scrap_mm || a.knife_count - b.knife_count);
}

export async function resolveProductsForPicks(
  coilThicknessMm: number,
  picks: { slit_width_mm: number; slit_count: number }[],
): Promise<SuggestedLine[] | null> {
  const lines: SuggestedLine[] = [];
  for (const p of picks) {
    const { data: slitRows, error: slitErr } = await supabase
      .from("slit_spec")
      .select("spec_id")
      .eq("thickness_mm", coilThicknessMm)
      .eq("width_mm", p.slit_width_mm)
      .limit(1);
    if (slitErr) throw slitErr;
    const slitSpecId = slitRows?.[0]?.spec_id;
    if (!slitSpecId) return null; // shouldn't happen since widths came from slit_spec itself

    const { data: mapRows, error: mapErr } = await supabase
      .from("slit_product_map")
      .select("product_id, observed_count, product:product_id ( label )")
      .eq("slit_spec_id", slitSpecId)
      .order("observed_count", { ascending: false })
      .limit(1);
    if (mapErr) throw mapErr;
    const best = mapRows?.[0] as
      | { product_id: number; product: { label: string } | null }
      | undefined;
    if (!best || !best.product) return null; // no known product for this slit size yet

    lines.push({
      slit_spec_id: slitSpecId,
      slit_width_mm: p.slit_width_mm,
      slit_count: p.slit_count,
      product_id: best.product_id,
      product_label: best.product.label,
    });
  }
  return lines;
}

/**
 * Original single-seed suggestion path, still used by the Plan detail "Suggest a
 * combination" button (Bulk Lab uses generateCandidates + resolveProductsForPicks
 * directly for the multi-seed version instead).
 */
export async function suggestCombination(
  coilThicknessMm: number,
  coilWidthMm: number,
): Promise<Suggestion | null> {
  const { data: slits, error: slitErr } = await supabase
    .from("slit_spec")
    .select("spec_id, width_mm")
    .eq("thickness_mm", coilThicknessMm)
    .order("width_mm", { ascending: false });
  if (slitErr) throw slitErr;
  if (!slits || slits.length === 0) return null;

  const tolerance = coilWidthMm * SCRAP_TOLERANCE_RATIO;
  let remaining = coilWidthMm;
  const picked: { slit_spec_id: number; slit_width_mm: number; slit_count: number }[] = [];

  for (const s of slits) {
    if (remaining < s.width_mm) continue;
    if (remaining <= tolerance) break;
    const count = Math.floor(remaining / s.width_mm);
    if (count <= 0) continue;
    picked.push({ slit_spec_id: s.spec_id, slit_width_mm: s.width_mm, slit_count: count });
    remaining -= s.width_mm * count;
    if (remaining <= tolerance) break;
  }

  if (picked.length === 0) return null;

  // Resolve the best-observed product per picked slit size.
  const lines: SuggestedLine[] = [];
  for (const p of picked) {
    const { data: mapRows, error: mapErr } = await supabase
      .from("slit_product_map")
      .select("product_id, observed_count, product:product_id ( label )")
      .eq("slit_spec_id", p.slit_spec_id)
      .order("observed_count", { ascending: false })
      .limit(1);
    if (mapErr) throw mapErr;
    const best = mapRows?.[0] as
      | { product_id: number; product: { label: string } | null }
      | undefined;
    if (!best || !best.product) continue; // skip slit sizes with no known product yet
    lines.push({
      slit_spec_id: p.slit_spec_id,
      slit_width_mm: p.slit_width_mm,
      slit_count: p.slit_count,
      product_id: best.product_id,
      product_label: best.product.label,
    });
  }

  if (lines.length === 0) return null;

  const total = lines.reduce((s, l) => s + l.slit_width_mm * l.slit_count, 0);
  return {
    lines,
    total_width_mm: total,
    scrap_mm: Math.max(0, coilWidthMm - total),
  };
}
