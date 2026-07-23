import { createFileRoute } from "@tanstack/react-router";
import { SpecCrud } from "@/components/spec-crud";

export const Route = createFileRoute("/slits")({
  head: () => ({ meta: [{ title: "Slit Specs — Slitting Planner" }] }),
  component: () => <SpecCrud title="Slit Specs" table="slit_spec" />,
});
