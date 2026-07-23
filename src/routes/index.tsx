import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import {
  Factory,
  Scissors,
  Layers,
  FlaskConical,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Scale,
  WifiOff,
  Gauge,
  Boxes,
  Target,
} from "lucide-react";
import logo from "@/assets/TNK_logo.png";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TSL Slitting Combination Analysis — Tononoka Steel Limited" },
      {
        name: "description",
        content:
          "TSL Slitting Combination Analysis — an internal tool for Tononoka Steel Limited that plans coil-to-strip slitting layouts, discovers new combinations, and calculates expected slit weight before a coil is cut.",
      },
      { property: "og:title", content: "TSL Slitting Combination Analysis" },
      {
        property: "og:description",
        content:
          "Plan coil-to-strip slitting, discover new combinations, and calculate expected slit weight — for Tononoka Steel Limited's slitting line.",
      },
    ],
  }),
  component: Landing,
});

const stats = [
  { icon: Scissors, value: "≤15", label: "Knives per layout" },
  { icon: Gauge, value: "0.1mm", label: "Scrap-window precision" },
  { icon: Boxes, value: "1 → ∞", label: "Single coil or full batch" },
  { icon: WifiOff, value: "Offline-ready", label: "Installable PWA" },
];

const features = [
  {
    icon: Layers,
    title: "Combination library",
    desc: "Browse every approved slitting combination with per-machine grouping and product tags.",
  },
  {
    icon: Scissors,
    title: "Coil-aware planner",
    desc: "Pick a coil, filter by slit or product, and see all valid layouts ranked by knife count.",
  },
  {
    icon: FlaskConical,
    title: "Exhaustive combination discovery",
    desc: "Set target slits to prioritize and optional sacrifice slits to balance — the search finds every layout inside your scrap window.",
  },
  {
    icon: Scale,
    title: "Slit weight intelligence",
    desc: "Enter average coil weight and number of coils to get an expected gross weight per slit size, before you cut.",
  },
  {
    icon: ShieldCheck,
    title: "Roles & audit trail",
    desc: "Viewer / Manager / Admin roles with full audit logging of every change and approval.",
  },
  {
    icon: WifiOff,
    title: "Works on the shop floor",
    desc: "Installable as an app and cached for offline use, so a weak signal near the line doesn't stop planning.",
  },
];

const workflow = [
  {
    step: "01",
    title: "Pick a coil, set your targets",
    desc: "Choose a single coil or scope to every coil of that thickness. Add target slits to prioritize and optional sacrifice slits to balance the layout.",
  },
  {
    step: "02",
    title: "Discover every valid layout",
    desc: "The exhaustive search returns every combination inside your scrap window, sorted by target-slit count, with an expected gross weight per slit size.",
  },
  {
    step: "03",
    title: "Approve or save as draft",
    desc: "Push a layout straight to a machine's library or hold it as a draft — duplicate-checked automatically.",
  },
  {
    step: "04",
    title: "Everything is logged",
    desc: "Every approval, edit, and rejection is captured in the audit trail, tied to the user and role that made it.",
  },
];

function Landing() {
  const { user, loading } = useAuth();

  // Signed-in users skip the landing page and go straight to the planner.
  if (!loading && user) {
    return <Navigate to="/planner" />;
  }

  return (
    <div className="relative isolate overflow-hidden">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-primary/95 backdrop-blur supports-[backdrop-filter]:bg-primary/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-white/10 ring-1 ring-white/20">
              <img src={logo} alt="Tononoka Steel Limited" className="h-5 w-5 object-contain" />
            </div>
            <div className="leading-tight">
              <div className="text-xs font-semibold tracking-tight text-primary-foreground">
                TSL Slitting Combination Analysis
              </div>
              <div className="text-[10px] text-primary-foreground/60">Tononoka Steel Limited</div>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-xs text-primary-foreground/70 sm:flex">
            <a href="#features" className="hover:text-primary-foreground">Features</a>
            <a href="#workflow" className="hover:text-primary-foreground">Workflow</a>
          </nav>
          <Button asChild size="sm" className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary via-steel-800 to-steel-900 text-primary-foreground">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(to_right,hsl(var(--secondary)/0.15)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--secondary)/0.15)_1px,transparent_1px)] [background-size:32px_32px]"
        />
        <div className="relative mx-auto max-w-6xl px-6 py-16 md:py-24">
          <div className="flex flex-col items-start gap-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-widest text-primary-foreground/80 backdrop-blur">
                <Factory className="h-3 w-3" /> Tononoka Steel Limited · Internal tool
              </div>
              <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-6xl">
                TSL Slitting
                <br />
                Combination Analysis
              </h1>
              <p className="mt-5 max-w-xl text-sm text-primary-foreground/80 md:text-base">
                Turn coil-to-strip slitting into a data-driven workflow: an
                exhaustive combination search built around target and sacrifice
                slits, expected slit weight before a single cut is made, and a
                searchable library of every approved layout on the floor.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
                  <Link to="/login">
                    Sign in to continue <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <p className="text-xs text-primary-foreground/70">
                  Accounts are provisioned by an administrator.
                </p>
              </div>
            </div>
            <div className="hidden shrink-0 md:block">
              <div className="grid h-40 w-40 place-items-center rounded-2xl bg-white/10 p-6 shadow-2xl ring-1 ring-white/20 backdrop-blur">
                <img src={logo} alt="Tononoka Steel Limited" className="h-full w-full object-contain" />
              </div>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="relative border-t border-white/10 bg-black/10">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden rounded-t-none bg-white/10 px-6 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-white/10 sm:bg-transparent sm:px-6">
            {stats.map((s) => (
              <div key={s.label} className="flex items-center gap-3 bg-primary px-4 py-5 sm:bg-transparent">
                <s.icon className="h-5 w-5 shrink-0 text-secondary" />
                <div>
                  <div className="font-mono text-lg font-semibold leading-none text-primary-foreground">
                    {s.value}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide text-primary-foreground/60">
                    {s.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-16 md:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Built for the slitting line
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Every feature is scoped to how the shop floor actually plans coils —
            no generic ERP fluff.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-xl border border-border/70 bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-200 group-hover:scale-110">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                {f.title}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="border-t bg-muted/40">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <div className="grid gap-10 md:grid-cols-2 md:items-start">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                From coil spec to approved combination
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                A single flow moves suggestions from the discovery search into
                machine-specific libraries, with duplicate protection and
                product tags baked in.
              </p>
              <ol className="mt-6 space-y-5">
                {workflow.map((w) => (
                  <li key={w.step} className="flex gap-4">
                    <span className="font-mono text-xs font-semibold text-secondary">
                      {w.step}
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{w.title}</div>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {w.desc}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
              <div className="mb-3 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                <Target className="h-3 w-3" /> Exhaustive combination discovery
              </div>
              <div className="space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                  <span className="text-muted-foreground">Coil</span>
                  <span className="font-semibold text-foreground">0.75 × 1160 mm</span>
                </div>
                <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                  <span className="text-muted-foreground">Targets</span>
                  <span className="font-semibold text-foreground">149:3, 157</span>
                </div>
                <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                  <span className="text-muted-foreground">Sacrifices</span>
                  <span className="font-semibold text-foreground">63, 99</span>
                </div>
                <div className="rounded-md border-2 border-secondary bg-secondary/5 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-secondary">
                    Suggested layout
                  </div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    3×149 · 1×157 · 2×99
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                    <span>6 knives</span>
                    <span>Scrap 8mm · 0.7%</span>
                  </div>
                  <div className="mt-2 border-t border-secondary/20 pt-2 text-[11px] text-muted-foreground">
                    <div className="flex justify-between">
                      <span>149mm: 620kg × 3</span>
                      <span className="font-semibold text-foreground">1,860 kg</span>
                    </div>
                    <div className="flex justify-between">
                      <span>157mm: 655kg × 1</span>
                      <span className="font-semibold text-foreground">655 kg</span>
                    </div>
                  </div>
                </div>
                <div className="pt-1 text-[11px] text-muted-foreground">
                  Duplicate-checked against the machine's library before
                  approval. Figures shown are illustrative.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust / why section */}
      <section className="mx-auto max-w-6xl px-6 py-16 md:py-20">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <div className="order-2 rounded-2xl border border-border/70 bg-card p-6 shadow-sm md:order-1">
            <ul className="space-y-4">
              {[
                { icon: Target, text: "Target slits are prioritized for max count; sacrifice slits fill the rest." },
                { icon: Scale, text: "Gross weight per slit size, calculated from average coil weight and coil count." },
                { icon: Boxes, text: "Plan against a single coil or every coil of a given thickness." },
                { icon: WifiOff, text: "Installable PWA with offline caching for the app shell and visited pages." },
              ].map((row) => (
                <li key={row.text} className="flex items-start gap-3">
                  <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                    <row.icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-sm text-foreground">{row.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="order-1 md:order-2">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Why the floor uses TSL, not a spreadsheet
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Manual layout planning is slow to check and easy to get wrong —
              a missed knife count or an unbalanced scrap window costs real
              coil. TSL Slitting Combination Analysis checks every constraint
              for you and shows the expected weight before the coil is cut.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "Pick a coil, filter by slit width or product",
                "Discover new mixes with target-slit priority",
                "Approve to a machine or save as a draft",
                "Full audit log of every promotion",
              ].map((s) => (
                <li key={s} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                  <span className="text-foreground">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-primary text-primary-foreground">
        <div className="mx-auto max-w-4xl px-6 py-14 text-center">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Ready to plan your next coil?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-primary-foreground/80">
            Sign in with the credentials your administrator provided to access
            the planner, library, and combination discovery.
          </p>
          <div className="mt-6">
            <Button asChild size="lg" className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
              <Link to="/login">
                Sign in <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-background">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-[11px] text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Tononoka Steel Limited" className="h-4 w-4 object-contain" />
            <span>© {new Date().getFullYear()} Tononoka Steel Limited. Internal use only.</span>
          </div>
          <span>TSL Slitting Combination Analysis</span>
        </div>
      </footer>
    </div>
  );
}
