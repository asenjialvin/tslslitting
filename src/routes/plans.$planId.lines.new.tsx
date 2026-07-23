import { createFileRoute } from "@tanstack/react-router";
import { PlanLineEditor } from "@/components/plan-line-editor";

export const Route = createFileRoute("/plans/$planId/lines/new")({
  head: () => ({ meta: [{ title: "Add plan line — Slitting Planner" }] }),
  component: NewLine,
});

function NewLine() {
  const { planId } = Route.useParams();
  return <PlanLineEditor planId={Number(planId)} />;
}
