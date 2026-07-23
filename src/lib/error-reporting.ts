// Standalone replacement for Lovable's preview-iframe error reporter
// (window.__lovableEvents only exists inside Lovable's own dev preview).
// This just logs to the console instead.
export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  console.error("[error boundary]", error, context);
}
