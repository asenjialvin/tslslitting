import { supabase } from "@/integrations/supabase/client";
import type { CombinationDetail } from "./types";

export async function fetchCoils() {
  const { data, error } = await supabase
    .from("coil_spec")
    .select("spec_id, thickness_mm, width_mm, source")
    .order("thickness_mm")
    .order("width_mm");
  if (error) throw error;
  return data;
}

export async function fetchSlits() {
  const { data, error } = await supabase
    .from("slit_spec")
    .select("spec_id, thickness_mm, width_mm, source")
    .order("thickness_mm")
    .order("width_mm");
  if (error) throw error;
  return data;
}

export async function fetchProducts() {
  const { data, error } = await supabase
    .from("product")
    .select("product_id, label")
    .order("label");
  if (error) throw error;
  return data;
}

export async function fetchMachines() {
  const { data, error } = await supabase
    .from("machine")
    .select("machine_id, code, name")
    .order("code");
  if (error) throw error;
  return data;
}

type ComboRow = {
  combination_id: number;
  total_slit_width_mm: number | null;
  no_of_coils_typical: number | null;
  scrap_mm: number | null;
  coil_spec: { spec_id: number; thickness_mm: number; width_mm: number } | null;
  combination_machine: Array<{
    frequency: number;
    machine: { code: string } | null;
  }>;
  combination_line: Array<{
    sequence: number;
    slit_count: number;
    slit_spec: { spec_id: number; thickness_mm: number; width_mm: number } | null;
    product: { product_id: number; label: string } | null;
  }>;
};

const COMBO_SELECT = `
  combination_id,
  total_slit_width_mm,
  no_of_coils_typical,
  scrap_mm,
  coil_spec:coil_spec_id ( spec_id, thickness_mm, width_mm ),
  combination_machine ( frequency, machine:machine_id ( code ) ),
  combination_line ( sequence, slit_count,
    slit_spec:slit_spec_id ( spec_id, thickness_mm, width_mm ),
    product:product_id ( product_id, label )
  )
`;

function toDetail(r: ComboRow): CombinationDetail | null {
  if (!r.coil_spec) return null;
  const machines = r.combination_machine
    .filter((m) => m.machine)
    .map((m) => ({ code: m.machine!.code, frequency: m.frequency }))
    .sort((a, b) => a.code.localeCompare(b.code));
  return {
    combination_id: r.combination_id,
    coil: r.coil_spec,
    total_slit_width_mm: r.total_slit_width_mm,
    no_of_coils_typical: r.no_of_coils_typical,
    // No schema column for this: a combination with no machine ever assigned is
    // treated as a provisional/draft; assigning one (the "approve" action) is
    // what promotes it into normal lookups.
    is_approved: machines.length > 0,
    scrap_mm: r.scrap_mm,
    machines,
    lines: r.combination_line
      .filter((l) => l.slit_spec && l.product)
      .map((l) => ({
        sequence: l.sequence,
        slit_count: l.slit_count,
        slit: l.slit_spec!,
        product: l.product!.label,
        product_id: l.product!.product_id,
      }))
      .sort((a, b) => a.sequence - b.sequence),
  };
}

export async function fetchCombinationsForCoil(
  coilSpecId: number,
  filters: { slitSpecId?: number | null; productId?: number | null; includeProvisional?: boolean } = {},
): Promise<CombinationDetail[]> {
  const { data, error } = await supabase
    .from("combination")
    .select(COMBO_SELECT)
    .eq("coil_spec_id", coilSpecId);
  if (error) throw error;
  let details = (data as unknown as ComboRow[])
    .map(toDetail)
    .filter((x): x is CombinationDetail => x !== null);
  if (!filters.includeProvisional) {
    details = details.filter((d) => d.is_approved);
  }
  if (filters.slitSpecId != null) {
    details = details.filter((d) =>
      d.lines.some((l) => l.slit.spec_id === filters.slitSpecId),
    );
  }
  if (filters.productId != null) {
    details = details.filter((d) =>
      d.lines.some((l) => l.product_id === filters.productId),
    );
  }
  return details.sort((a, b) => {
    const fa = a.machines.reduce((s, m) => s + m.frequency, 0);
    const fb = b.machines.reduce((s, m) => s + m.frequency, 0);
    return fb - fa;
  });
}

export async function fetchAllCombinations(machineCode?: string | null) {
  const { data, error } = await supabase.from("combination").select(COMBO_SELECT);
  if (error) throw error;
  let details = (data as unknown as ComboRow[])
    .map(toDetail)
    .filter((x): x is CombinationDetail => x !== null)
    .filter((d) => d.is_approved);
  if (machineCode) {
    details = details.filter((d) => d.machines.some((m) => m.code === machineCode));
  }
  return details.sort((a, b) => a.combination_id - b.combination_id);
}

/** Coils with at least one approved (machine-assigned) combination vs ones sitting
 *  as unassigned drafts — used by the Bulk Lab to decide what to (re)generate. */
export async function getCoilCombinationStatus(
  coilSpecId: number,
): Promise<{ hasApproved: boolean; hasDraft: boolean }> {
  const { data, error } = await supabase
    .from("combination")
    .select("combination_id, combination_machine ( machine_id )")
    .eq("coil_spec_id", coilSpecId);
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    combination_id: number;
    combination_machine: { machine_id: number }[];
  }>;
  return {
    hasApproved: rows.some((r) => r.combination_machine.length > 0),
    hasDraft: rows.some((r) => r.combination_machine.length === 0),
  };
}

export async function fetchProvisionalQueue(): Promise<CombinationDetail[]> {
  const { data, error } = await supabase.from("combination").select(COMBO_SELECT);
  if (error) throw error;
  const details = (data as unknown as ComboRow[])
    .map(toDetail)
    .filter((x): x is CombinationDetail => x !== null)
    .filter((d) => !d.is_approved);
  // Sort: coil thickness -> coil width -> scrap ascending -> knife count ascending (tie-breaker)
  return details.sort((a, b) => {
    if (a.coil.thickness_mm !== b.coil.thickness_mm)
      return a.coil.thickness_mm - b.coil.thickness_mm;
    if (a.coil.width_mm !== b.coil.width_mm) return a.coil.width_mm - b.coil.width_mm;
    const scrapA = a.scrap_mm ?? 0;
    const scrapB = b.scrap_mm ?? 0;
    if (scrapA !== scrapB) return scrapA - scrapB;
    const knivesA = a.lines.reduce((s, l) => s + l.slit_count, 0);
    const knivesB = b.lines.reduce((s, l) => s + l.slit_count, 0);
    return knivesA - knivesB;
  });
}

export type PlanSummary = {
  plan_id: number;
  plan_number: string;
  status: string;
  planned_for: string | null;
  created_at: string;
  machine: { machine_id: number; code: string } | null;
  line_count: number;
};

export async function fetchPlans(): Promise<PlanSummary[]> {
  const { data, error } = await supabase
    .from("plan")
    .select(
      "plan_id, plan_number, status, planned_for, created_at, machine:machine_id ( machine_id, code ), plan_line ( plan_line_id )",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as Array<{
    plan_id: number;
    plan_number: string;
    status: string;
    planned_for: string | null;
    created_at: string;
    machine: { machine_id: number; code: string } | null;
    plan_line: { plan_line_id: number }[];
  }>).map((p) => ({
    plan_id: p.plan_id,
    plan_number: p.plan_number,
    status: p.status,
    planned_for: p.planned_for,
    created_at: p.created_at,
    machine: p.machine,
    line_count: p.plan_line?.length ?? 0,
  }));
}

export type PlanLineDetail = {
  plan_line_id: number;
  sequence: number;
  no_of_coils: number;
  status: string;
  combination: CombinationDetail;
};

export async function fetchPlanDetail(planId: number) {
  const { data: plan, error: planErr } = await supabase
    .from("plan")
    .select("plan_id, plan_number, status, planned_for, notes, machine:machine_id ( machine_id, code )")
    .eq("plan_id", planId)
    .single();
  if (planErr) throw planErr;

  const { data: lines, error: linesErr } = await supabase
    .from("plan_line")
    .select(
      `plan_line_id, sequence, no_of_coils, status,
       combination:combination_id ( ${COMBO_SELECT} )`,
    )
    .eq("plan_id", planId)
    .order("sequence");
  if (linesErr) throw linesErr;

  const planLines: PlanLineDetail[] = (
    lines as unknown as Array<{
      plan_line_id: number;
      sequence: number;
      no_of_coils: number;
      status: string;
      combination: ComboRow;
    }>
  )
    .map((l) => {
      const detail = toDetail(l.combination);
      if (!detail) return null;
      return {
        plan_line_id: l.plan_line_id,
        sequence: l.sequence,
        no_of_coils: l.no_of_coils,
        status: l.status,
        combination: detail,
      };
    })
    .filter((x): x is PlanLineDetail => x !== null);

  return {
    plan: plan as unknown as {
      plan_id: number;
      plan_number: string;
      status: string;
      planned_for: string | null;
      notes: string | null;
      machine: { machine_id: number; code: string } | null;
    },
    lines: planLines,
  };
}
