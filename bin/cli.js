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

5. Exclude the frontend from the backend build — add to tsconfig.build.json:
   "exclude": ["node_modules", "dist", "test", "**/*spec.ts", "resources", "vite.config.mts"]

6. Optional — so UI-library CLIs (e.g. shadcn) can auto-detect the @ alias,
   add to your root tsconfig.json compilerOptions:
   "paths": { "@/*": ["./resources/js/*"] }
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
