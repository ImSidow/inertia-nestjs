#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function isNestProject(cwd) {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return false;
  }

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

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return { error: 'missing' };
  try {
    return { value: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
  } catch {
    return { error: 'invalid-json' };
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

// tsconfig.build.json's "exclude" overrides (not merges with) the base
// tsconfig.json's, so the frontend files must be excluded here directly or
// the Nest backend build tries to type-check them.
function patchTsconfigBuildExclude(cwd) {
  const filePath = path.join(cwd, 'tsconfig.build.json');
  const { value: tsconfig, error } = readJson(filePath);
  if (error) return { file: 'tsconfig.build.json', status: error };

  const exclude = Array.isArray(tsconfig.exclude) ? tsconfig.exclude : [];
  const additions = ['resources', 'vite.config.mts'].filter((entry) => !exclude.includes(entry));

  if (additions.length === 0) return { file: 'tsconfig.build.json', status: 'already-present' };

  tsconfig.exclude = exclude.concat(additions);
  writeJson(filePath, tsconfig);
  return { file: 'tsconfig.build.json', status: 'patched', additions };
}

// Adds the @/* alias to the root tsconfig.json so UI-library CLIs that read
// aliases from the project root (e.g. shadcn's init) can detect it, since
// the alias otherwise only lives in the nested resources/js/tsconfig.json.
function patchRootTsconfigAlias(cwd) {
  const filePath = path.join(cwd, 'tsconfig.json');
  const { value: tsconfig, error } = readJson(filePath);
  if (error) return { file: 'tsconfig.json', status: error };

  tsconfig.compilerOptions = tsconfig.compilerOptions || {};
  tsconfig.compilerOptions.paths = tsconfig.compilerOptions.paths || {};

  if (tsconfig.compilerOptions.paths['@/*']) {
    return { file: 'tsconfig.json', status: 'already-present' };
  }

  tsconfig.compilerOptions.paths['@/*'] = ['./resources/js/*'];
  writeJson(filePath, tsconfig);
  return { file: 'tsconfig.json', status: 'patched' };
}

const DEPENDENCIES = ['@inertiajs/react', '@inertiajs/vite', 'react', 'react-dom'];
const DEV_DEPENDENCIES = ['vite', '@vitejs/plugin-react'];

// Detected from the lockfile already present, since a project's own choice
// of package manager isn't recorded anywhere else. Defaults to npm — every
// Node project has a package.json, so it's the one universal fallback.
function detectPackageManager(cwd) {
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(cwd, 'bun.lockb')) || fs.existsSync(path.join(cwd, 'bun.lock'))) return 'bun';
  return 'npm';
}

// The verb (and dev-flag spelling) for "add these specific packages"
// differs per manager — not just the binary name.
const INSTALL_ARGS = {
  npm: { add: ['install'], addDev: ['install', '-D'] },
  pnpm: { add: ['add'], addDev: ['add', '-D'] },
  yarn: { add: ['add'], addDev: ['add', '-D'] },
  bun: { add: ['add'], addDev: ['add', '-d'] },
};

function runInstallCommand(manager, cwd, args, packages) {
  // shell:true only matters on Windows, where npm/pnpm/yarn/bun are .cmd
  // shims spawnSync can't exec directly without it; package names here have
  // no shell metacharacters, so this is safe.
  const result = spawnSync(manager, [...args, ...packages], {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return !result.error && result.status === 0;
}

// Installs are the one step here that touch the network and can fail for
// reasons outside this CLI's control — unlike the file-only operations
// above, so callers must handle a failed result by falling back to printed
// manual instructions, never assume success.
function installDependencies(cwd) {
  const manager = detectPackageManager(cwd);
  const { add, addDev } = INSTALL_ARGS[manager];

  console.log(`\nInstalling dependencies with ${manager}...`);
  const depsOk = runInstallCommand(manager, cwd, add, DEPENDENCIES);
  const devDepsOk = depsOk && runInstallCommand(manager, cwd, addDev, DEV_DEPENDENCIES);

  return { manager, success: depsOk && devDepsOk };
}

function logPatchResult(result) {
  if (result.status === 'patched') {
    console.log(`patched  ${result.file}`);
  } else if (result.status === 'already-present') {
    console.log(`skipped  ${result.file} (already up to date)`);
  } else if (result.status === 'missing') {
    console.log(`skipped  ${result.file} (not found)`);
  } else {
    console.log(`skipped  ${result.file} (not valid JSON — leave it to you)`);
  }
}

const NEXT_STEPS = `
Next steps:

1. Add these scripts to package.json:
   "dev:client": "vite build --watch",
   "build:client": "vite build",
   "build:server": "vite build --ssr resources/js/ssr.tsx",
   "build:ssr": "npm run build:client && npm run build:server",
   "serve:ssr": "node bootstrap/ssr/ssr.js"

2. Register InertiaModule in your AppModule:

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

3. Install and wire up the Handlebars view engine and static assets:
   npm install hbs

   In src/main.ts:
     import { NestExpressApplication } from '@nestjs/platform-express';
     import { join } from 'node:path';
     import hbs from 'hbs';

     const app = await NestFactory.create<NestExpressApplication>(AppModule);
     app.useStaticAssets(join(process.cwd(), 'public'));
     app.setBaseViewsDir(join(process.cwd(), 'views'));
     app.setViewEngine('hbs');
     hbs.registerHelper('json', (value) => JSON.stringify(value));
`;

function manualInstallFallback(manager) {
  return `
Automatic install via ${manager} failed — install manually:
   npm install ${DEPENDENCIES.join(' ')}
   npm install -D ${DEV_DEPENDENCIES.join(' ')}
`;
}

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

  logPatchResult(patchTsconfigBuildExclude(cwd));
  logPatchResult(patchRootTsconfigAlias(cwd));

  const { manager, success } = installDependencies(cwd);
  console.log(success ? `installed dependencies via ${manager}` : manualInstallFallback(manager));

  console.log(NEXT_STEPS);
}

module.exports = {
  run,
  isNestProject,
  copyTemplate,
  patchTsconfigBuildExclude,
  patchRootTsconfigAlias,
  detectPackageManager,
};

if (require.main === module) {
  run(process.argv, process.cwd());
}
