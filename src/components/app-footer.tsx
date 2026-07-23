export function AppFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border/60 bg-background py-3 text-center text-[11px] text-muted-foreground">
      © {year} Tononoka Steels · Designed by{" "}
      <a
        href="https://linktr.ee/muhindi_alvin"
        target="_blank"
        rel="noreferrer"
        className="text-foreground/70 underline decoration-secondary decoration-2 underline-offset-2 transition-colors hover:text-secondary"
      >
        Alvin Muhindi
      </a>
    </footer>
  );
}
