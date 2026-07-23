# Deploying tsl-slitting-planner to Netlify

The Netlify site and environment variables are already created:
- Site name: tsl-slitting-planner
- Site ID: 377a3986-5449-44f0-8464-abdc0f073f10
- Live URL (once deployed): https://tsl-slitting-planner.netlify.app
- Env vars already set: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY

## One more env var you need to add yourself
Grab `SUPABASE_SERVICE_ROLE_KEY` from your Supabase dashboard
(Project Settings -> API -> service_role secret) and add it in the Netlify UI:
Site settings -> Environment variables -> Add a variable
(Not needed for the app to load; only needed if/when server-side admin operations are used.)

## Option A — Deploy via Netlify CLI (fastest)
1. Unzip this project and `cd` into it.
2. `npm install`
3. `npx netlify-cli login` (opens a browser to authenticate)
4. `npx netlify-cli link --id 377a3986-5449-44f0-8464-abdc0f073f10`
5. `npm run build`
6. `npx netlify-cli deploy --prod`

## Option B — Connect a GitHub repo (best for ongoing updates)
1. Push this project to a new GitHub repo.
2. In the Netlify dashboard, open the "tsl-slitting-planner" site -> Site configuration -> Build & deploy -> Link repository.
3. Build command: `npm run build`   |   Publish directory: `dist/client`
   (Netlify's TanStack Start plugin automatically wires up the serverless function too.)
4. Every push to main will auto-deploy from then on.

- NEW since the last package: the Bulk Combination Lab (/bulk-lab) and Admin panel
  (/admin) — no database schema changes required for either.

## Bulk Combination Lab — how "provisional vs approved" works without a schema change
Rather than adding a `status` column, this reuses what's already there: a combination
with **zero** `combination_machine` rows is treated as an unreviewed draft; a
combination with **at least one** (i.e. it's been assigned to GMT or 25T) is treated
as approved and shows up everywhere normally. "Approve & promote" in the Bulk Lab
is literally just assigning it a machine. This means the existing "New combination"
editor now requires picking a machine (it used to be optional) — otherwise a
manually-created combo would accidentally look like an unreviewed draft.

One real trade-off worth knowing: there's no persistent memory of a *rejected* draft
(no column to store that). Rejecting just deletes it outright. A later Bulk Lab run
could regenerate a similar layout for that same coil later, since there's nothing to
remember not to. If that becomes annoying in practice, the fix is a small schema
change (an actual `status` enum with a `rejected` state) — happy to add that
whenever you're ready to run a migration.

## Admin panel — role management without a service-role key
There's no server-side admin key configured, so the Admin panel can't look up users
by email (that needs access to the `auth.users` table, which isn't exposed to the
client). Instead: any signed-in user without a role yet sees a "No role — copy ID"
button in the header; they send you that ID, and you paste it into the Admin panel's
"Grant role" form. Existing role assignments can be changed or removed from the same
table. The Admin panel also links out to Bulk Lab, Audit log, and Dashboard as a
central hub instead of needing direct database access for routine tasks.

## What's already done for you
- All app code pulled from the current Lovable project (routes, components, styling,
  the combination editor with dedup-warning flow, branding) — unchanged, as requested.
- vite.config.ts rewired from Lovable's Cloudflare-targeting wrapper to Netlify's
  official @netlify/vite-plugin-tanstack-start.
- Verified working production build locally (`npm run build` succeeds, generates
  dist/client + .netlify/v1/functions/server.mjs).
- Backend is unchanged: same live Supabase project as Lovable, so data stays in sync
  no matter which one you use.
- Batch planning (/plans list + /plans/:id detail) with the in-house greedy heuristic
  for coils with no known combination, the refined XLSX export (S/N column,
  boxed-fraction segments, tight-scrap highlighting), a login page (email/password
  via Supabase Auth, self-signup removed — see the access-control note below),
  role-gated CRUD across combinations/coils/slits/products, an audit log viewer with
  entity/user/date filters and a before/after diff view, a dashboard with key metrics
  + GMT/25T usage chart + recent activity, a single adaptive sidebar toggle, mobile
  table scroll fixes, and the Bulk Lab + Admin panel described above.

## Access control — this is genuinely locked down now, but check one Supabase setting
Self-service sign-up is removed from the app's UI. For this to be a *complete* lock
(not just hidden from the UI), also turn off "Allow new users to sign up" in
Supabase Dashboard -> Authentication -> Sign In / Providers -> Email. After that,
the only way to get an account is for you to create one via Authentication -> Users
-> Add/Invite user.

## Important: bootstrapping your first Admin user
RBAC roles are stored in `user_roles` and nobody has one by default — new sign-ups
start with no role (view-only, per the app's RLS policies). This one-time bootstrap
still needs raw SQL since no one has Admin access to the panel yet; every role grant
after this first one can go through the in-app Admin panel (/admin) instead. Run this
in the Supabase SQL Editor (Project -> SQL Editor), replacing the email:
```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'you@example.com';
```

## Known follow-ups
- src/assets/TNK_logo.jpg is a placeholder (simple "TS" mark) — I couldn't transfer the
  real binary logo file cleanly through this session. Swap in the real Tononoka Steels
  logo file at that path before/after deploying.
- SUPABASE_SERVICE_ROLE_KEY is not set anywhere (correctly, since it's a secret) — add
  it as a Netlify environment variable only if/when a server-side admin feature needs it.

## If you already pushed once and got a "Could not resolve entry for router" build error
That happens if only root-level files got pushed and the src/ folder was left out —
common with GitHub's drag-and-drop web uploader, which doesn't reliably handle nested
folders. Push properly with git instead (preserves the full folder structure):
```bash
cd tsl-slitting-planner-netlify
git init
git add .
git commit -m "Full project"
git branch -M main
git remote add origin https://github.com/asenjialvin/tslslitting.git
git push -f origin main
```

