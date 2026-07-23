import { createFileRoute } from "@tanstack/react-router";
import { SpecCrud } from "@/components/spec-crud";

export const Route = createFileRoute("/coils")({
  head: () => ({ meta: [{ title: "Coil Specs — Slitting Planner" }] }),
  component: () => <SpecCrud title="Coil Specs" table="coil_spec" />,
});
