# Slate

A citation-first research and writing desk for clinicians and academics —
find, organize, draft, and check.

## Stack

- [Next.js](https://nextjs.org) (App Router, TypeScript, React 19) with the
  `src/` directory layout
- [WorkOS AuthKit](https://workos.com/docs/authkit) for authentication
  (`@workos-inc/authkit-nextjs`)
- [Neon](https://neon.tech) serverless Postgres +
  [Drizzle ORM](https://orm.drizzle.team)
- [Lucide](https://lucide.dev) icons; CSS transitions for motion
- pnpm, Node 20+

The visual and interaction authority is `docs/design/design.md` (**FROZEN**)
and the specs under `docs/design/specs/`. Every color, font, radius, and
motion value in component code references the CSS tokens defined in
`src/app/globals.css` — never raw values.

## Getting started

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

Without WorkOS credentials, dev mode runs with a mock session (`Dr. Singh`)
so the app shell renders immediately. Real auth activates automatically once
the WorkOS env vars are set.

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable                          | Purpose                                                      |
| --------------------------------- | ------------------------------------------------------------ |
| `WORKOS_API_KEY`                  | WorkOS secret key                                            |
| `WORKOS_CLIENT_ID`                | WorkOS client id                                             |
| `WORKOS_COOKIE_PASSWORD`          | 32+ char secret used to encrypt the session cookie           |
| `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | AuthKit callback, e.g. `http://localhost:3000/auth/callback` |
| `DATABASE_URL`                    | Neon **pooled** connection string (runtime, neon-http)       |
| `DATABASE_URL_UNPOOLED`           | Neon **direct** connection string (drizzle-kit migrations)   |

Never commit `.env*` files (only `.env.example` is tracked).

## Scripts

| Command            | What it does                                     |
| ------------------ | ------------------------------------------------ |
| `pnpm dev`         | Dev server                                       |
| `pnpm build`       | Production build                                 |
| `pnpm typecheck`   | `tsc --noEmit`                                   |
| `pnpm lint`        | ESLint, zero warnings allowed                    |
| `pnpm format`      | Prettier write (`format:check` to verify)        |
| `pnpm db:generate` | Generate SQL migrations from the schema          |
| `pnpm db:migrate`  | Apply migrations (needs `DATABASE_URL_UNPOOLED`) |

## Layout

```
docs/design/          frozen design authority (do not edit values)
drizzle/              generated SQL migrations
src/app/              routes (App Router); (app)/ is the authed shell
src/components/       shell + feature components (CSS Modules, tokens only)
src/lib/auth/         AuthKit session helpers + dev bypass
src/lib/db/           Drizzle schema, Neon client, user upsert
src/proxy.ts          AuthKit route protection (Next 16 proxy)
```

The `src/lib` / `src/types` / `src/app/api` layout is load-bearing: a search
engine module will later be imported verbatim into `src/lib/search/**` with
couplings at `src/lib/http/**`, `src/lib/ai/`, and `src/types/search.ts`.
