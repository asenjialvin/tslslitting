import { createFileRoute } from "@tanstack/react-router";
import { PlanLineEditor } from "@/components/plan-line-editor";

export const Route = createFileRoute("/plans/$planId/lines/$lineId/edit")({
  head: () => ({ meta: [{ title: "Edit plan line — Slitting Planner" }] }),
  component: EditLine,
});

function EditLine() {
  const { planId, lineId } = Route.useParams();
  return <PlanLineEditor planId={Number(planId)} lineId={Number(lineId)} />;
}
