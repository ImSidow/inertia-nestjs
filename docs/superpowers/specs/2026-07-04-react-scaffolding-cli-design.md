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
- `vite.config.ts`: add the `@inertiajs/vite` plugin alongside `react()`.
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
  vite.config.ts
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

**UI-library neutrality:** the template ships no `components.json`, no
Tailwind config, no CSS framework, no UI dependency. `resources/js/tsconfig.json`
carries the `@/*` alias so any UI-lib CLI that reads `tsconfig.json` for
alias detection (shadcn's `init` in particular) finds it without extra
configuration from the developer.

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
  vite.config.ts
```

Nothing under `src/` (NestJS side) is touched — that's the printed
`AppModule` snippet, applied by hand.

## Verification

No test framework needed for a file-copy script; one manual check instead:

- Scaffold into a scratch NestJS project, paste the printed `AppModule`
  snippet, install the printed dependencies, run the dev/build scripts, and
  confirm the page hydrates (no blank page — the `app.hbs` fix is what
  this actually exercises).
- Run `npx shadcn init` against the scaffolded project and confirm it
  detects the `@` alias without manual prompts.
- Re-run `npx inertia-nestjs react` a second time and confirm existing
  files are reported as skipped, not overwritten.
