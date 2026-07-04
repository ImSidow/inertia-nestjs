# React Scaffolding CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `examples/nestjs-react` so it actually hydrates, then ship `npx inertia-nestjs react` — a bin command that scaffolds the same known-good React+Vite+Inertia files into any existing NestJS project.

**Architecture:** Three independent pieces, in dependency order: (1) fix the example project's markup/config so it's a correct reference again, (2) copy those fixed files into a `templates/react/` directory bundled with the npm package, (3) a dependency-free `bin/cli.js` that detects a NestJS project, copies the template (skipping existing files), and prints the remaining manual steps.

**Tech Stack:** Node stdlib only for the CLI (`fs`, `path` — no `commander`/`yargs`). Tests via the existing Jest + ts-jest setup (`test/**/*.spec.ts`), no new test framework.

## Global Constraints

- No `--template` flag or multi-framework support — React is the only template.
- No automatic editing of the consumer's `app.module.ts` or `package.json` scripts — the CLI prints a snippet, it never mutates those files.
- No `--force`/overwrite flag — the CLI skips any destination file that already exists and reports it.
- No auto-install of dependencies and no auto-run of the dev server — the CLI only prints the commands.
- No `nest add` schematic integration — a plain bin script must work in any NestJS project, not just Nest-CLI-scaffolded ones.
- The template ships no UI-library dependency, no `components.json`, no CSS framework — only the `@/*` path alias (in both `vite.config.ts` and `resources/js/tsconfig.json`) so a UI-lib CLI (e.g. shadcn) can self-detect it later.
- `bin/cli.js` has zero runtime dependencies of its own.

---

### Task 1: Fix `examples/nestjs-react` wiring

**Files:**
- Modify: `examples/nestjs-react/views/app.hbs`
- Modify: `examples/nestjs-react/vite.config.ts`
- Modify: `examples/nestjs-react/resources/js/tsconfig.json`
- Modify: `examples/nestjs-react/package.json`

**Interfaces:**
- Produces: the corrected file contents that Task 2 copies verbatim into `templates/react/`.

- [ ] **Step 1: Replace the `data-page` div-attribute pattern in `app.hbs` with the script-tag pattern `@inertiajs/core` actually reads**

Current content has `<div id='app' data-page='{{{json page}}}'>`. Replace the full `<body>` block so the file reads:

```html
<html lang='en'>
  <head>
    <meta charset='UTF-8' />
    <meta name='viewport' content='width=device-width, initial-scale=1.0' />

    {{#each ssrHead}}
      {{{this}}}
    {{/each}}

    <script type='module' src='/build/app.js'></script>
  </head>
  <body>
    <script type='application/json' data-page='app'>{{{json page}}}</script>

    {{#if ssrBody}}
      <div id='app'>{{{ssrBody}}}</div>
    {{else}}
      <div id='app'></div>
    {{/if}}
  </body>
</html>
```

- [ ] **Step 2: Add the `@inertiajs/vite` plugin to `vite.config.ts`**

Replace the file with:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import inertia from '@inertiajs/vite';
import path from 'node:path';

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [inertia(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'resources/js'),
    },
  },
  build: isSsrBuild
    ? {
        ssr: 'resources/js/ssr.tsx',
        outDir: 'bootstrap/ssr',
        emptyOutDir: false,
        rollupOptions: {
          output: {
            entryFileNames: 'ssr.js',
          },
        },
      }
    : {
        outDir: 'public/build',
        emptyOutDir: true,
        rollupOptions: {
          input: 'resources/js/app.tsx',
          output: {
            entryFileNames: 'app.js',
            chunkFileNames: 'chunks/[name]-[hash].js',
            assetFileNames: 'assets/[name]-[hash][extname]',
          },
        },
      },
}));
```

- [ ] **Step 3: Add the `@/*` path alias to `resources/js/tsconfig.json`**

Add `"paths": { "@/*": ["./*"] }` to `compilerOptions` so the file reads:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "strict": true,
    "skipLibCheck": true,
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "react", "react-dom"],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["./**/*.ts", "./**/*.tsx", "./**/*.d.ts"]
}
```

- [ ] **Step 4: Add `@inertiajs/vite` as a devDependency in `examples/nestjs-react/package.json`**

In `devDependencies`, add (keep alphabetical position next to `@nestjs/schematics` / before `@nestjs/testing` is fine, exact position doesn't matter):

```json
    "@inertiajs/vite": "^3.4.0",
```

- [ ] **Step 5: Install and build to verify the config is valid**

Run:
```bash
cd examples/nestjs-react && pnpm install && pnpm run build:client
```
Expected: build completes with no errors, and `public/build/app.js` is produced. This confirms `vite.config.ts` parses and the `@inertiajs/vite` plugin loads correctly. (It does not by itself prove hydration — that's covered by Task 4's manual browser check.)

- [ ] **Step 6: Commit**

```bash
cd /Users/im-sidow/Documents/programming/test/inertia-nestjs-adapter
git add examples/nestjs-react/views/app.hbs examples/nestjs-react/vite.config.ts examples/nestjs-react/resources/js/tsconfig.json examples/nestjs-react/package.json examples/nestjs-react/pnpm-lock.yaml
git commit -m "fix(example-react): use script-tag page hydration, add @inertiajs/vite plugin and @/* alias"
```

---

### Task 2: Populate `templates/react/`

**Files:**
- Create: `templates/react/views/app.hbs`
- Create: `templates/react/vite.config.ts`
- Create: `templates/react/resources/js/app.tsx`
- Create: `templates/react/resources/js/ssr.tsx`
- Create: `templates/react/resources/js/tsconfig.json`
- Create: `templates/react/resources/js/vite-env.d.ts`
- Create: `templates/react/resources/js/pages/.gitkeep`

**Interfaces:**
- Consumes: the fixed file contents from Task 1 (`app.hbs`, `vite.config.ts`, `resources/js/tsconfig.json`) plus the example's already-correct `app.tsx`/`ssr.tsx`/`vite-env.d.ts`.
- Produces: `templates/react/` — the exact directory tree `bin/cli.js` (Task 3) walks and copies into a target project.

- [ ] **Step 1: Copy the fixed `app.hbs`**

Create `templates/react/views/app.hbs` with the exact content from Task 1 Step 1 (the script-tag version).

- [ ] **Step 2: Copy the fixed `vite.config.ts`**

Create `templates/react/vite.config.ts` with the exact content from Task 1 Step 2.

- [ ] **Step 3: Copy the fixed `resources/js/tsconfig.json`**

Create `templates/react/resources/js/tsconfig.json` with the exact content from Task 1 Step 3.

- [ ] **Step 4: Copy `resources/js/app.tsx` unchanged**

Create `templates/react/resources/js/app.tsx`:

```tsx
import type { ComponentType } from 'react';
import { createInertiaApp } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';

type PageModule = {
  default: ComponentType<Record<string, unknown>>;
};

const appName = 'Inertia App';
const pages = import.meta.glob<PageModule>('./pages/**/*.tsx');

void createInertiaApp({
  title: (title) => (title ? `${title} - ${appName}` : appName),

  resolve: async (name) => {
    const page = pages[`./pages/${name}.tsx`];

    if (!page) {
      throw new Error(`Page not found: ${name}`);
    }

    const module = await page();
    return module.default;
  },

  setup({ el, App, props }) {
    createRoot(el).render(<App {...props} />);
  },

  progress: {
    color: '#4B5563',
  },
});
```

(Note: `appName` is generic `'Inertia App'` here — the example project keeps its own `'NestJS React Example'` in `examples/nestjs-react/resources/js/app.tsx`, unchanged by this plan. The template is a separate file the CLI copies into other people's projects.)

- [ ] **Step 5: Copy `resources/js/ssr.tsx` unchanged (with the generic app name)**

Create `templates/react/resources/js/ssr.tsx`:

```tsx
import type { ComponentType } from 'react';
import { createInertiaApp } from '@inertiajs/react';
import createServer from '@inertiajs/react/server';
import ReactDOMServer from 'react-dom/server';

type PageModule = {
  default: ComponentType<Record<string, unknown>>;
};

const appName = 'Inertia App';
const pages = import.meta.glob<PageModule>('./pages/**/*.tsx');

createServer((page) =>
  createInertiaApp({
    page,
    render: ReactDOMServer.renderToString,
    title: (title) => (title ? `${title} - ${appName}` : appName),

    resolve: async (name) => {
      const pageModule = pages[`./pages/${name}.tsx`];

      if (!pageModule) {
        throw new Error(`SSR page not found: ${name}`);
      }

      const module = await pageModule();
      return module.default;
    },

    setup: ({ App, props }) => <App {...props} />,
  }),
);
```

- [ ] **Step 6: Copy `resources/js/vite-env.d.ts` unchanged**

Create `templates/react/resources/js/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 7: Add an empty `pages/` directory placeholder**

Create `templates/react/resources/js/pages/.gitkeep` (empty file). This keeps the `pages/` directory present in the published package (npm drops empty directories) without shipping example-specific demo pages into every scaffolded project.

- [ ] **Step 8: Verify the tree is correct**

Run:
```bash
find templates/react -type f | sort
```
Expected output:
```
templates/react/resources/js/app.tsx
templates/react/resources/js/pages/.gitkeep
templates/react/resources/js/ssr.tsx
templates/react/resources/js/tsconfig.json
templates/react/resources/js/vite-env.d.ts
templates/react/vite.config.ts
templates/react/views/app.hbs
```

- [ ] **Step 9: Commit**

```bash
git add templates/react
git commit -m "feat: add templates/react scaffold source for the CLI"
```

---

### Task 3: `bin/cli.js` scaffolding command

**Files:**
- Create: `bin/cli.js`
- Create: `test/cli.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `templates/react/` from Task 2 (read at runtime via `path.join(__dirname, '..', 'templates', 'react')`).
- Produces: `module.exports = { run, isNestProject, copyTemplate }` from `bin/cli.js` — `isNestProject(cwd: string): boolean`, `copyTemplate(templateDir: string, targetDir: string): { created: string[], skipped: string[] }`, `run(argv: string[], cwd: string): void`.

- [ ] **Step 1: Write the failing tests**

Create `test/cli.spec.ts`:

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { isNestProject, copyTemplate } = require('../bin/cli') as {
  isNestProject: (cwd: string) => boolean;
  copyTemplate: (
    templateDir: string,
    targetDir: string,
  ) => { created: string[]; skipped: string[] };
};

function mkTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'inertia-cli-test-'));
}

describe('isNestProject', () => {
  it('returns true when package.json has @nestjs/core in dependencies', () => {
    const dir = mkTempDir();
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ dependencies: { '@nestjs/core': '^11.0.0' } }),
    );

    expect(isNestProject(dir)).toBe(true);
  });

  it('returns true when package.json has @nestjs/core in devDependencies', () => {
    const dir = mkTempDir();
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ devDependencies: { '@nestjs/core': '^11.0.0' } }),
    );

    expect(isNestProject(dir)).toBe(true);
  });

  it('returns false when there is no package.json', () => {
    const dir = mkTempDir();

    expect(isNestProject(dir)).toBe(false);
  });

  it('returns false when package.json has no @nestjs/core dependency', () => {
    const dir = mkTempDir();
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ dependencies: { react: '^19.0.0' } }),
    );

    expect(isNestProject(dir)).toBe(false);
  });
});

describe('copyTemplate', () => {
  function makeFixtureTemplate(): string {
    const templateDir = mkTempDir();
    fs.mkdirSync(path.join(templateDir, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(templateDir, 'top.txt'), 'top');
    fs.writeFileSync(path.join(templateDir, 'nested', 'inner.txt'), 'inner');
    return templateDir;
  }

  it('copies every file from the template into an empty target', () => {
    const templateDir = makeFixtureTemplate();
    const targetDir = mkTempDir();

    const result = copyTemplate(templateDir, targetDir);

    expect(result.created.sort()).toEqual(['nested/inner.txt', 'top.txt'].sort());
    expect(result.skipped).toEqual([]);
    expect(fs.readFileSync(path.join(targetDir, 'top.txt'), 'utf8')).toBe('top');
    expect(fs.readFileSync(path.join(targetDir, 'nested', 'inner.txt'), 'utf8')).toBe('inner');
  });

  it('skips files that already exist at the destination and leaves their content untouched', () => {
    const templateDir = makeFixtureTemplate();
    const targetDir = mkTempDir();
    fs.writeFileSync(path.join(targetDir, 'top.txt'), 'user content');

    const result = copyTemplate(templateDir, targetDir);

    expect(result.created).toEqual(['nested/inner.txt']);
    expect(result.skipped).toEqual(['top.txt']);
    expect(fs.readFileSync(path.join(targetDir, 'top.txt'), 'utf8')).toBe('user content');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
npx jest test/cli.spec.ts
```
Expected: FAIL — `Cannot find module '../bin/cli'` (the file doesn't exist yet).

- [ ] **Step 3: Implement `bin/cli.js`**

Create `bin/cli.js`:

```js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function isNestProject(cwd) {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
  return Boolean(deps['@nestjs/core']);
}

function copyTemplate(templateDir, targetDir) {
  const created = [];
  const skipped = [];

  function walk(relDir) {
    const srcDir = path.join(templateDir, relDir);
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const relPath = path.join(relDir, entry.name);

      if (entry.isDirectory()) {
        walk(relPath);
        continue;
      }

      const destPath = path.join(targetDir, relPath);

      if (fs.existsSync(destPath)) {
        skipped.push(relPath);
        continue;
      }

      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(path.join(templateDir, relPath), destPath);
      created.push(relPath);
    }
  }

  walk('.');
  return { created, skipped };
}

const NEXT_STEPS = `
Next steps:

1. Add dependencies:
   npm install @inertiajs/react @inertiajs/vite react react-dom
   npm install -D vite @vitejs/plugin-react

2. Add these scripts to package.json:
   "dev:client": "vite build --watch",
   "build:client": "vite build",
   "build:server": "vite build --ssr resources/js/ssr.tsx",
   "build:ssr": "npm run build:client && npm run build:server",
   "serve:ssr": "node bootstrap/ssr/ssr.js"

3. Register InertiaModule in your AppModule:

   import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
   import { HandleInertiaRequests, InertiaModule } from 'inertia-nestjs';

   @Module({
     imports: [
       InertiaModule.forRoot({
         rootView: 'app',
         version: '1.0.0',
       }),
     ],
   })
   export class AppModule implements NestModule {
     configure(consumer) {
       consumer.apply(HandleInertiaRequests).forRoutes('*');
     }
   }
`;

function run(argv, cwd) {
  const subcommand = argv[2];

  if (subcommand !== 'react') {
    console.error(`Usage: inertia-nestjs react\n\nUnknown subcommand: ${subcommand || '(none)'}`);
    process.exitCode = 1;
    return;
  }

  if (!isNestProject(cwd)) {
    console.error(
      "This doesn't look like a NestJS project (no @nestjs/core dependency found in package.json). Run this from your Nest project root.",
    );
    process.exitCode = 1;
    return;
  }

  const templateDir = path.join(__dirname, '..', 'templates', 'react');
  const { created, skipped } = copyTemplate(templateDir, cwd);

  for (const file of created) console.log(`created  ${file}`);
  for (const file of skipped) console.log(`skipped  ${file} (already exists)`);

  console.log(NEXT_STEPS);
}

module.exports = { run, isNestProject, copyTemplate };

if (require.main === module) {
  run(process.argv, process.cwd());
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
npx jest test/cli.spec.ts
```
Expected: PASS — 6 tests passing (`isNestProject` x4, `copyTemplate` x2).

- [ ] **Step 5: Wire up `package.json` — add `bin` and extend `files`**

In `package.json`, add a `bin` field (top level, next to `"main"`/`"types"`):

```json
    "bin": {
        "inertia-nestjs": "bin/cli.js"
    },
```

And extend the existing `"files"` array to include the new directories:

```json
    "files": [
        "dist",
        "bin",
        "templates",
        "README.md",
        "LICENSE"
    ],
```

- [ ] **Step 6: Make the bin script executable**

Run:
```bash
chmod +x bin/cli.js
```

- [ ] **Step 7: Smoke-test the CLI directly (not yet via npx) against a throwaway directory**

Run:
```bash
mkdir -p /tmp/inertia-cli-smoke && echo '{"dependencies":{"@nestjs/core":"^11.0.0"}}' > /tmp/inertia-cli-smoke/package.json
node bin/cli.js react # run once with cwd unset — expect the "not a NestJS project" message since this repo's own cwd IS a Nest-adjacent lib but has no @nestjs/core dep itself
```
Then test the real path by invoking `run` with an explicit cwd via a one-off script:
```bash
node -e "require('./bin/cli.js').run(['node','cli','react'], '/tmp/inertia-cli-smoke')"
find /tmp/inertia-cli-smoke -type f | sort
```
Expected: prints `created  views/app.hbs`, `created  resources/js/app.tsx`, etc. (one `created` line per template file) followed by the next-steps block, and `find` shows the full `templates/react` tree now under `/tmp/inertia-cli-smoke`.

Run it a second time:
```bash
node -e "require('./bin/cli.js').run(['node','cli','react'], '/tmp/inertia-cli-smoke')"
```
Expected: every line now says `skipped  ... (already exists)` — no file is overwritten.

Clean up:
```bash
rm -rf /tmp/inertia-cli-smoke
```

- [ ] **Step 8: Commit**

```bash
git add bin/cli.js test/cli.spec.ts package.json
git commit -m "feat: add npx inertia-nestjs react scaffolding CLI"
```

---

### Task 4: End-to-end manual verification

**Files:** none (verification only, no code changes).

**Interfaces:** none — this exercises the artifacts from Tasks 1–3 together.

- [ ] **Step 1: Scaffold into a scratch NestJS project**

```bash
cd /tmp && npx --yes @nestjs/cli new inertia-scaffold-check --skip-git --package-manager npm
cd inertia-scaffold-check
npm install /Users/im-sidow/Documents/programming/test/inertia-nestjs-adapter
npx inertia-nestjs react
```
Expected: `created` lines for every template file, followed by the next-steps block.

- [ ] **Step 2: Follow the printed next steps**

Install the printed dependencies, add the printed scripts to `package.json`, and paste the printed `AppModule` snippet into `src/app.module.ts` (adding a matching controller route that returns `@Inertia('home')` isn't required for this check — the goal is confirming the build and hydration wiring, not app logic).

- [ ] **Step 3: Build and run**

```bash
npm run build:client
npm run start:dev
```
Open the app in a browser and confirm the page renders (no blank page) — this is the concrete confirmation that the `app.hbs` script-tag fix from Task 1 actually hydrates client-side, which no automated test in this plan covers directly.

- [ ] **Step 4: Confirm shadcn alias detection**

```bash
npx shadcn@latest init
```
Expected: shadcn's CLI detects the Vite + React setup and the `@/*` alias without prompting you to configure aliases manually (it may still ask style/color questions — that's expected; only the alias auto-detection is what this step is checking).

- [ ] **Step 5: Clean up the scratch project**

```bash
cd /tmp && rm -rf inertia-scaffold-check
```

No commit for this task — it's a manual verification pass, not a code change.
