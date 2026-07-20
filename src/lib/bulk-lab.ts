import { supabase } from "@/integrations/supabase/client";
import { generateCandidates, resolveProductsForPicks } from "@/lib/heuristic";
import { getCoilCombinationStatus } from "@/lib/queries";

export type BulkRunSummary = {
  totalCoils: number;
  skippedApproved: number;
  skippedExistingDraft: number;
  generated: number;
  coilsWithNoCandidates: { spec_id: number; thickness_mm: number; width_mm: number }[];
};

async function getAvailableWidths(thicknessMm: number): Promise<number[]> {
  const { data, error } = await supabase
    .from("slit_spec")
    .select("width_mm")
    .eq("thickness_mm", thicknessMm);
  if (error) throw error;
  return (data ?? []).map((r) => r.width_mm as number);
}

/**
 * Ensures every pick has a slit_spec + linked product. When the DB has no
 * product mapped for a slit width yet, we auto-create a placeholder product
 * ("Unmapped {width}mm @ {thickness}mm") and register it in slit_product_map
 * with observed_count=0 so real observations still outrank it later. Used by
 * the "Save draft" path so planners aren't blocked by missing product tags.
 */
async function resolveOrCreateLinesForPicks(
  coilThicknessMm: number,
  picks: { slit_width_mm: number; slit_count: number }[],
): Promise<{ slit_spec_id: number; product_id: number; slit_count: number }[]> {
  const out: { slit_spec_id: number; product_id: number; slit_count: number }[] = [];
  for (const p of picks) {
    const { data: slitRows, error: slitErr } = await supabase
      .from("slit_spec")
      .select("spec_id")
      .eq("thickness_mm", coilThicknessMm)
      .eq("width_mm", p.slit_width_mm)
      .limit(1);
    if (slitErr) throw slitErr;
    let slitSpecId = slitRows?.[0]?.spec_id as number | undefined;
    if (!slitSpecId) {
      const { data: newSlit, error: insErr } = await supabase
        .from("slit_spec")
        .insert({ thickness_mm: coilThicknessMm, width_mm: p.slit_width_mm })
        .select("spec_id")
        .single();
      if (insErr) throw insErr;
      slitSpecId = newSlit.spec_id;
    }

    const { data: mapRows, error: mapErr } = await supabase
      .from("slit_product_map")
      .select("product_id")
      .eq("slit_spec_id", slitSpecId)
      .order("observed_count", { ascending: false })
      .limit(1);
    if (mapErr) throw mapErr;
    let productId = mapRows?.[0]?.product_id as number | undefined;

    if (!productId) {
      const label = `Unmapped ${p.slit_width_mm}mm @ ${coilThicknessMm}mm`;
      const { data: existingProd, error: prodErr } = await supabase
        .from("product")
        .select("product_id")
        .eq("label", label)
        .limit(1);
      if (prodErr) throw prodErr;
      productId = existingProd?.[0]?.product_id as number | undefined;
      if (!productId) {
        const { data: newProd, error: newProdErr } = await supabase
          .from("product")
          .insert({ label })
          .select("product_id")
          .single();
        if (newProdErr) throw newProdErr;
        productId = newProd.product_id;
      }
      const { error: linkErr } = await supabase
        .from("slit_product_map")
        .insert({ slit_spec_id: slitSpecId, product_id: productId, observed_count: 0 });
      if (linkErr && !/duplicate|unique/i.test(linkErr.message)) throw linkErr;
    }

    out.push({ slit_spec_id: slitSpecId, product_id: productId, slit_count: p.slit_count });
  }
  return out;
}

export async function saveCandidate(
  coilSpecId: number,
  coilThicknessMm: number,
  candidate: {
    picks: { slit_width_mm: number; slit_count: number }[];
    total_width_mm: number;
    scrap_mm: number;
  },
  machineId: number | null = null,
  opts: { autoCreateMissingProducts?: boolean } = {},
): Promise<boolean> {
  let payloadLines: { slit_spec_id: number; product_id: number; slit_count: number }[];
  if (opts.autoCreateMissingProducts) {
    payloadLines = await resolveOrCreateLinesForPicks(coilThicknessMm, candidate.picks);
  } else {
    const resolved = await resolveProductsForPicks(coilThicknessMm, candidate.picks);
    if (!resolved) return false;
    payloadLines = resolved.map((l) => ({
      slit_spec_id: l.slit_spec_id,
      product_id: l.product_id,
      slit_count: l.slit_count,
    }));
  }

  const payload = payloadLines.map((l, i) => ({
    sequence: i + 1,
    slit_spec_id: l.slit_spec_id,
    product_id: l.product_id,
    slit_count: l.slit_count,
  }));

  const { data, error } = await supabase.rpc("upsert_combination", {
    _coil_spec_id: coilSpecId,
    _lines: payload,
    _machine_id: (machineId ?? null) as unknown as number,
    _total_slit_width_mm: candidate.total_width_mm,
    _scrap_mm: candidate.scrap_mm,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return !!row;
}


export async function runBulkGeneration(
  onProgress?: (done: number, total: number) => void,
): Promise<BulkRunSummary> {
  const { data: coils, error } = await supabase
    .from("coil_spec")
    .select("spec_id, thickness_mm, width_mm");
  if (error) throw error;

  const summary: BulkRunSummary = {
    totalCoils: coils?.length ?? 0,
    skippedApproved: 0,
    skippedExistingDraft: 0,
    generated: 0,
    coilsWithNoCandidates: [],
  };

  let done = 0;
  for (const coil of coils ?? []) {
    done += 1;
    onProgress?.(done, summary.totalCoils);

    const { hasApproved, hasDraft } = await getCoilCombinationStatus(coil.spec_id);
    if (hasApproved) {
      summary.skippedApproved += 1;
      continue;
    }
    if (hasDraft) {
      summary.skippedExistingDraft += 1;
      continue;
    }

    const widths = await getAvailableWidths(coil.thickness_mm);
    const candidates = generateCandidates(widths, coil.width_mm);
    if (candidates.length === 0) {
      summary.coilsWithNoCandidates.push(coil);
      continue;
    }

    let savedAny = false;
    for (const candidate of candidates) {
      const saved = await saveCandidate(coil.spec_id, coil.thickness_mm, candidate);
      if (saved) {
        summary.generated += 1;
        savedAny = true;
      }
    }
    if (!savedAny) summary.coilsWithNoCandidates.push(coil);
  }

  return summary;
}

export async function regenerateForCoil(coilSpecId: number): Promise<number> {
  const { data: coil, error: coilErr } = await supabase
    .from("coil_spec")
    .select("spec_id, thickness_mm, width_mm")
    .eq("spec_id", coilSpecId)
    .single();
  if (coilErr) throw coilErr;

  const widths = await getAvailableWidths(coil.thickness_mm);
  const candidates = generateCandidates(widths, coil.width_mm);
  let saved = 0;
  for (const candidate of candidates) {
    const ok = await saveCandidate(coil.spec_id, coil.thickness_mm, candidate);
    if (ok) saved += 1;
  }
  return saved;
}

export async function approveDraft(combinationId: number, machineId: number) {
  const { error } = await supabase
    .from("combination_machine")
    .insert({ combination_id: combinationId, machine_id: machineId, frequency: 0 });
  if (error) throw error;
}

export async function rejectDraft(combinationId: number) {
  const { error: lineErr } = await supabase
    .from("combination_line")
    .delete()
    .eq("combination_id", combinationId);
  if (lineErr) throw lineErr;
  const { error: comboErr } = await supabase
    .from("combination")
    .delete()
    .eq("combination_id", combinationId);
  if (comboErr) throw comboErr;
}

/** Canonical structural key: picks sorted asc by slit width, joined width×count. */
export function canonicalStructuralKey(
  picks: { slit_width_mm: number; slit_count: number }[],
): string {
  return picks
    .slice()
    .filter((p) => p.slit_count > 0)
    .sort((a, b) => a.slit_width_mm - b.slit_width_mm)
    .map((p) => `${p.slit_width_mm}x${p.slit_count}`)
    .join("+");
}

/**
 * Look up the coil_spec matching a thickness+width and return its id plus
 * structural keys already present in the DB. Keys are bucketed per machine
 * (plus a "null" bucket for drafts without a machine assignment) so callers
 * can enforce a strict per-machine duplicate check at approval time.
 */
export async function fetchCoilContext(
  thicknessMm: number,
  widthMm: number,
): Promise<{
  coilSpecId: number | null;
  existingKeys: Set<string>; // union of all buckets — used for "hide already-known"
  approvedKeys: Set<string>; // any machine assigned
  keysByMachine: Record<string, Set<string>>; // machine_id.toString() or "null"
}> {
  const { data: coilRows, error: coilErr } = await supabase
    .from("coil_spec")
    .select("spec_id")
    .eq("thickness_mm", thicknessMm)
    .eq("width_mm", widthMm)
    .limit(1);
  if (coilErr) throw coilErr;
  const coilSpecId = coilRows?.[0]?.spec_id ?? null;
  if (!coilSpecId) {
    return {
      coilSpecId: null,
      existingKeys: new Set(),
      approvedKeys: new Set(),
      keysByMachine: {},
    };
  }

  const { data: combos, error: comboErr } = await supabase
    .from("combination")
    .select(
      `combination_id,
       combination_machine ( machine_id ),
       combination_line ( slit_count, slit_spec:slit_spec_id ( width_mm ) )`,
    )
    .eq("coil_spec_id", coilSpecId);
  if (comboErr) throw comboErr;

  const existingKeys = new Set<string>();
  const approvedKeys = new Set<string>();
  const keysByMachine: Record<string, Set<string>> = {};
  const bucket = (k: string) => (keysByMachine[k] ??= new Set<string>());

  for (const c of (combos ?? []) as Array<{
    combination_machine: { machine_id: number }[];
    combination_line: { slit_count: number; slit_spec: { width_mm: number } | null }[];
  }>) {
    const picks = c.combination_line
      .filter((l) => l.slit_spec)
      .map((l) => ({
        slit_width_mm: l.slit_spec!.width_mm,
        slit_count: l.slit_count,
      }));
    const key = canonicalStructuralKey(picks);
    if (!key) continue;
    existingKeys.add(key);
    if (c.combination_machine.length > 0) {
      approvedKeys.add(key);
      for (const m of c.combination_machine) bucket(String(m.machine_id)).add(key);
    } else {
      bucket("null").add(key);
    }
  }
  return { coilSpecId, existingKeys, approvedKeys, keysByMachine };
}

/**
 * Best-observed product per slit width at a given coil thickness — used to
 * annotate ad-hoc discovery results so a planner can see which product each
 * slit resolves to before approving.
 */
export async function fetchProductMapForThickness(
  thicknessMm: number,
): Promise<Record<number, { product_id: number; label: string }>> {
  const { data, error } = await supabase
    .from("slit_spec")
    .select(
      `width_mm,
       slit_product_map ( product_id, observed_count, product:product_id ( label ) )`,
    )
    .eq("thickness_mm", thicknessMm);
  if (error) throw error;
  const map: Record<number, { product_id: number; label: string }> = {};
  for (const row of (data ?? []) as Array<{
    width_mm: number;
    slit_product_map: {
      product_id: number;
      observed_count: number | null;
      product: { label: string } | null;
    }[];
  }>) {
    const best = row.slit_product_map
      .filter((m) => m.product)
      .sort((a, b) => (b.observed_count ?? 0) - (a.observed_count ?? 0))[0];
    if (best?.product) {
      map[row.width_mm] = { product_id: best.product_id, label: best.product.label };
    }
  }
  return map;
}


