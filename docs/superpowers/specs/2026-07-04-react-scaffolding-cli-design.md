# React scaffolding CLI for inertia-nestjs

Status: approved
Date: 2026-07-04

## Problem

`examples/nestjs-react` is the only reference for wiring React + Vite + Inertia
onto a NestJS app, and it's currently stale relative to the adapter it ships
with:

- `views/app.hbs` embeds page data as a `data-page` attribute on the `#app`
  div. `@inertiajs/core`'s `getInitialPageFromDOM` only reads
  `script[data-page="app"][type="application/json"]` — the div-attribute
  markup never hydrates, so a project built from the example ships a blank
  page.
- `vite.config.ts` doesn't register the `@inertiajs/vite` plugin.
- `resources/js/tsconfig.json` has no `@/*` path alias, even though
  `vite.config.ts` defines one — TypeScript can't resolve `@/...` imports,
  and tools that detect path aliases from `tsconfig.json` (e.g. the shadcn
  CLI) won't find it.

There's also no way to bring Inertia + React into an existing NestJS project
short of copy-pasting the example by hand.

## Goals

1. Fix the example project so it's a correct, working reference again.
2. Ship a `react` scaffolding command in `inertia-nestjs` itself
   (`npx inertia-nestjs react`) that copies the same known-good files into
   an existing NestJS project.
3. The scaffolded output must be usable with any UI library (shadcn, plain
   CSS, Mantine, etc.) without committing to one — meaning correct path
   aliasing, and no UI-library dependency pre-installed.

## Non-goals

- No `--template` flag / multiple frontend frameworks. React is the only
  template; add a flag when a second template exists.
- No automatic editing of the consumer's `app.module.ts` or `package.json`
  scripts. The CLI prints the snippet; the developer pastes it. AST-editing
  someone else's existing files is a correctness risk that isn't justified
  until people demonstrably get the manual step wrong.
- No `--force` / re-scaffold flow. The CLI skips files that already exist
  at the destination. Add overwrite support only when someone needs to
  re-scaffold.
- No auto-install of dependencies or auto-run of the dev server. The CLI
  prints the commands; it doesn't shell out to the consumer's package
  manager (which one they use isn't guaranteed to be npm).
- No `nest add` schematic. A plain bin script works for any NestJS project,
  not just ones scaffolded via Nest CLI.

## Design

### A. Fix `examples/nestjs-react`

- `views/app.hbs`: replace the `data-page` div attribute with the
  script-tag pattern already used correctly in stockra:
  ```html
  <script type="application/json" data-page="app">{{{json page}}}</script>
  <div id="app">{{#if ssrBody}}{{{ssrBody}}}{{/if}}</div>
  ```
- `vite.config.ts` → `vite.config.mts`: add the `@inertiajs/vite` plugin
  alongside `react()`. The `.mts` extension is required, not cosmetic:
  `@inertiajs/vite` is ESM-only, and Vite/esbuild loads a plain `.ts` config
  as CommonJS in a project without `"type": "module"`, which fails to
  `require()` the ESM-only package. `.mts` forces ESM regardless of the
  project's own module type.
- `resources/js/tsconfig.json`: add `"paths": { "@/*": ["./*"] }`.
- `resources/js/app.tsx`, `ssr.tsx`: no functional changes needed — already
  match the pattern the CLI template will reuse.

These files become the literal source for the CLI's bundled template
(section B) — one known-good copy, not two things to keep in sync by hand.

### B. `npx inertia-nestjs react`

**Command surface:** `package.json` gets a `bin` entry:

```json
"bin": { "inertia-nestjs": "bin/cli.js" }
```

`bin/cli.js` is a plain Node script (CommonJS, no dependencies — `fs`/`path`
stdlib only). Argv handling is a single `if (argv[2] !== 'react')` check;
no argument-parsing library, since there's exactly one subcommand.

**Template source:** a `templates/react/` directory, published with the
package (added to `package.json`'s `files`), populated with the fixed
example's files:

```
templates/react/
  resources/js/app.tsx
  resources/js/ssr.tsx
  resources/js/pages/          (empty, or one placeholder page)
  resources/js/tsconfig.json
  resources/js/vite-env.d.ts
  views/app.hbs
  vite.config.mts
```

**Steps the CLI performs, in order:**

1. Read `./package.json` in the cwd. If `dependencies["@nestjs/core"]` and
   `devDependencies["@nestjs/core"]` are both absent, print an error
   ("this doesn't look like a NestJS project — run this from your Nest
   project root") and exit non-zero.
2. Walk `templates/react/` and `fs.cpSync` each file into the matching path
   under cwd, `recursive: true`. Before copying each individual file, check
   `fs.existsSync` on the destination — skip and record it if present,
   copy if not. Print a per-file "created" / "skipped (exists)" line.
3. Print a fixed block of next steps:
   - the dependency list to add (`@inertiajs/react`, `@inertiajs/vite`,
     `react`, `react-dom`, `vite`, `@vitejs/plugin-react`)
   - the `package.json` scripts to add (`dev:client`, `build:client`,
     `build:server`, `build:ssr`, `serve:ssr`)
   - the `AppModule` snippet: `InertiaModule.forRoot({...})` import +
     `HandleInertiaRequests` middleware registration
   - the `main.ts` snippet: `hbs` install + `app.useStaticAssets(...)`,
     `app.setBaseViewsDir(...)`, `app.setViewEngine('hbs')`, and the
     `json` Handlebars helper `views/app.hbs` relies on — found missing
     during end-to-end testing (see Verification); without it every
     `@Inertia` route 500s and the built bundle 404s
   - a `tsconfig.build.json` exclude for `resources` and `vite.config.mts`
     — also found missing during end-to-end testing; without it the
     frontend `.tsx` files leak into the Nest backend type-check and the
     build fails
   - an optional root-`tsconfig.json` `"paths": { "@/*": ["./resources/js/*"] }`
     addition — see UI-library neutrality below

**UI-library neutrality:** the template ships no `components.json`, no
Tailwind config, no CSS framework, no UI dependency. The `@/*` alias lives
in `resources/js/tsconfig.json` for the frontend's own type-checking, but
UI-lib CLIs that detect aliases (shadcn's `init` in particular) read the
project's *root* `tsconfig.json`, not the nested one — confirmed by testing
directly against shadcn. The printed next-steps therefore include an
optional step to add the same alias to the root `tsconfig.json`, which is
what actually makes shadcn's alias detection pass. Even with that step,
shadcn's `init` still hard-aborts on missing Tailwind CSS before reaching
any style prompts — expected and permanent for this deliberately
Tailwind-free template, not something this feature makes "just work."

## File layout after scaffolding

```
<project>/
  resources/js/
    app.tsx
    ssr.tsx
    tsconfig.json      (with @/* alias)
    vite-env.d.ts
    pages/
  views/app.hbs
  vite.config.mts
```

Nothing under `src/` (NestJS side) is touched — that's the printed
`AppModule`/`main.ts` snippets, applied by hand.

## Verification

No test framework needed for a file-copy script; a manual end-to-end pass
instead — done twice: once against the original printed next-steps (which
found the gaps below), once after fixing them:

- Scaffold into a scratch NestJS project and follow the printed next-steps
  **verbatim, with no manual additions**, then confirm the page hydrates
  (no blank page). The first pass this way found two steps missing —
  no `hbs`/`main.ts` wiring (every route 500'd) and no `tsconfig.build.json`
  exclude (backend build failed) — both now printed (see Design section B).
- Run `npx shadcn init` against the scaffolded project. As shipped, its
  alias check fails: shadcn reads the root `tsconfig.json`, not the nested
  `resources/js/tsconfig.json`. Adding the printed optional root-alias step
  makes the alias check pass; shadcn still aborts separately on missing
  Tailwind, which is expected for this Tailwind-free template.
- Re-run `npx inertia-nestjs react` a second time and confirm existing
  files are reported as skipped, not overwritten.
