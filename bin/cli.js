#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

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

4. Install and wire up the Handlebars view engine and static assets:
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

  console.log(NEXT_STEPS);
}

module.exports = {
  run,
  isNestProject,
  copyTemplate,
  patchTsconfigBuildExclude,
  patchRootTsconfigAlias,
};

if (require.main === module) {
  run(process.argv, process.cwd());
}
