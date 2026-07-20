export function AppFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t bg-primary py-3 text-center text-[11px] text-primary-foreground">
      © {year} Tononoka Steels · Designed by{" "}
      <a
        href="https://linktr.ee/muhindi_alvin"
        target="_blank"
        rel="noreferrer"
        className="underline decoration-secondary decoration-2 underline-offset-2 hover:text-secondary"
      >
        Alvin Muhindi
      </a>
    </footer>
  );
}
