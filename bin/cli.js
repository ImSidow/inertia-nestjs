#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
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

// Tier 1: always safe to auto-apply — appending known keys to a JSON object,
// same risk profile as the tsconfig patches above.
const SCRIPTS = {
  'dev:client': 'vite build --watch',
  'build:client': 'vite build',
  'build:server': 'vite build --ssr resources/js/ssr.tsx',
  'build:ssr': 'npm run build:client && npm run build:server',
  'serve:ssr': 'node bootstrap/ssr/ssr.js',
};

function patchPackageJsonScripts(cwd) {
  const filePath = path.join(cwd, 'package.json');
  const { value: pkg, error } = readJson(filePath);
  if (error) return { file: 'package.json', status: error };

  pkg.scripts = pkg.scripts || {};
  const additions = Object.keys(SCRIPTS).filter((key) => !(key in pkg.scripts));

  if (additions.length === 0) return { file: 'package.json', status: 'already-present' };

  for (const key of additions) pkg.scripts[key] = SCRIPTS[key];
  writeJson(filePath, pkg);
  return { file: 'package.json', status: 'patched', additions };
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

function installPackages(manager, cwd, packages, dev) {
  if (packages.length === 0) return true;
  const args = dev ? INSTALL_ARGS[manager].addDev : INSTALL_ARGS[manager].add;
  return runInstallCommand(manager, cwd, args, packages);
}

// Installs are the one step here that touch the network and can fail for
// reasons outside this CLI's control — unlike the file-only operations
// above, so callers must handle a failed result by falling back to printed
// manual instructions, never assume success.
function installDependencies(cwd) {
  const manager = detectPackageManager(cwd);

  console.log(`\nInstalling dependencies with ${manager}...`);
  const depsOk = installPackages(manager, cwd, DEPENDENCIES, false);
  const devDepsOk = depsOk && installPackages(manager, cwd, DEV_DEPENDENCIES, true);

  return { manager, success: depsOk && devDepsOk };
}

function insertAfterLastImport(content, newImportLines) {
  const importLines = [...content.matchAll(/^import .*;$/gm)];
  if (importLines.length === 0) return newImportLines.join('\n') + '\n' + content;

  const last = importLines[importLines.length - 1];
  const insertAt = last.index + last[0].length;
  return content.slice(0, insertAt) + '\n' + newImportLines.join('\n') + content.slice(insertAt);
}

// Tier 2 (prompt-gated): only rewrites src/main.ts when it still matches the
// untouched `nest new` scaffold — a plain NestFactory.create(AppModule) call
// with no existing view-engine setup. Anything else (already customized,
// different variable name pattern, etc.) reports shape-mismatch rather than
// guessing an insertion point.
function wireMainTs(cwd) {
  const filePath = path.join(cwd, 'src', 'main.ts');
  if (!fs.existsSync(filePath)) return { file: 'src/main.ts', status: 'missing' };

  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes("registerHelper('json'")) {
    return { file: 'src/main.ts', status: 'already-present' };
  }

  const createRegex = /const\s+(\w+)\s*=\s*await\s+NestFactory\.create\(\s*AppModule\s*\)\s*;/;
  const match = content.match(createRegex);
  if (!match) return { file: 'src/main.ts', status: 'shape-mismatch' };

  const appVar = match[1];
  content = content.replace(
    createRegex,
    `const ${appVar} = await NestFactory.create<NestExpressApplication>(AppModule);\n` +
      `  ${appVar}.useStaticAssets(join(process.cwd(), 'public'));\n` +
      `  ${appVar}.setBaseViewsDir(join(process.cwd(), 'views'));\n` +
      `  ${appVar}.setViewEngine('hbs');\n` +
      `  hbs.registerHelper('json', (value) => JSON.stringify(value));`,
  );

  content = insertAfterLastImport(content, [
    "import { NestExpressApplication } from '@nestjs/platform-express';",
    "import { join } from 'node:path';",
    "import hbs from 'hbs';",
  ]);

  fs.writeFileSync(filePath, content);
  return { file: 'src/main.ts', status: 'patched' };
}

// Tier 3 (prompt-gated, most cautious): only rewrites src/app.module.ts when
// all three untouched-scaffold markers match — the plain `{ Module }` import,
// an empty imports array, and an empty class body. A single mismatch (an
// existing import, a non-empty imports array, custom class body) means the
// file was already customized, so this bails entirely rather than applying
// a partial edit.
function wireAppModule(cwd) {
  const filePath = path.join(cwd, 'src', 'app.module.ts');
  if (!fs.existsSync(filePath)) return { file: 'src/app.module.ts', status: 'missing' };

  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes('InertiaModule')) {
    return { file: 'src/app.module.ts', status: 'already-present' };
  }

  const moduleImportRegex = /import \{ Module \} from '@nestjs\/common';/;
  const emptyImportsRegex = /imports:\s*\[\s*\]/;
  const emptyClassRegex = /export class AppModule\s*\{\s*\}/;

  if (!moduleImportRegex.test(content) || !emptyImportsRegex.test(content) || !emptyClassRegex.test(content)) {
    return { file: 'src/app.module.ts', status: 'shape-mismatch' };
  }

  content = content
    .replace(
      moduleImportRegex,
      "import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';\n" +
        "import { HandleInertiaRequests, InertiaModule } from 'inertia-nestjs';",
    )
    .replace(
      emptyImportsRegex,
      "imports: [\n    InertiaModule.forRoot({\n      rootView: 'app',\n      version: '1.0.0',\n    }),\n  ]",
    )
    .replace(
      emptyClassRegex,
      'export class AppModule implements NestModule {\n' +
        '  configure(consumer: MiddlewareConsumer) {\n' +
        "    consumer.apply(HandleInertiaRequests).forRoutes('*');\n" +
        '  }\n' +
        '}',
    );

  fs.writeFileSync(filePath, content);
  return { file: 'src/app.module.ts', status: 'patched' };
}

// Non-TTY contexts (CI, piped input) always decline — there's no one there
// to answer, so the safe default is the same printed-instructions behavior
// as before this feature existed.
function promptYesNo(question) {
  if (!process.stdin.isTTY) return Promise.resolve(false);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} (y/N) `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
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

const APP_MODULE_SNIPPET = `
Register InertiaModule in your AppModule:

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
     configure(consumer: MiddlewareConsumer) {
       consumer.apply(HandleInertiaRequests).forRoutes('*');
     }
   }
`;

const MAIN_TS_SNIPPET = `
Install and wire up the Handlebars view engine and static assets:
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

// Reports what happened to a prompt-gated wire attempt and, whenever it
// didn't result in working code (declined, missing file, or a shape that
// wasn't safe to touch), prints the manual snippet as a fallback so the
// step is never silently dropped.
function reportWireResult(result, manualSnippet) {
  if (result.status === 'patched') {
    console.log(`patched  ${result.file}`);
  } else if (result.status === 'already-present') {
    console.log(`skipped  ${result.file} (already wired)`);
  } else if (result.status === 'missing') {
    console.log(`skipped  ${result.file} (not found)`);
    console.log(manualSnippet);
  } else if (result.status === 'shape-mismatch') {
    console.log(`skipped  ${result.file} (doesn't match the default NestJS scaffold — wire it manually)`);
    console.log(manualSnippet);
  }
}

async function run(argv, cwd) {
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

  // Tier 1: always-safe JSON patches, no prompt needed.
  logPatchResult(patchTsconfigBuildExclude(cwd));
  logPatchResult(patchRootTsconfigAlias(cwd));
  logPatchResult(patchPackageJsonScripts(cwd));

  const { manager, success } = installDependencies(cwd);
  console.log(success ? `installed dependencies via ${manager}` : manualInstallFallback(manager));

  // Tier 2: prompt-gated, shape-checked — src/main.ts.
  const wireMain = await promptYesNo(
    '\nAuto-wire src/main.ts for the Handlebars view engine and static assets?',
  );
  if (wireMain) {
    const mainResult = wireMainTs(cwd);
    reportWireResult(mainResult, MAIN_TS_SNIPPET);
    if (mainResult.status === 'patched' && success) {
      console.log(`\nInstalling hbs with ${manager}...`);
      installPackages(manager, cwd, ['hbs'], false);
    }
  } else {
    console.log(MAIN_TS_SNIPPET);
  }

  // Tier 3: prompt-gated, shape-checked, most cautious — src/app.module.ts.
  const wireModule = await promptYesNo('\nAuto-wire src/app.module.ts to register InertiaModule?');
  if (wireModule) {
    reportWireResult(wireAppModule(cwd), APP_MODULE_SNIPPET);
  } else {
    console.log(APP_MODULE_SNIPPET);
  }
}

module.exports = {
  run,
  isNestProject,
  copyTemplate,
  patchTsconfigBuildExclude,
  patchRootTsconfigAlias,
  patchPackageJsonScripts,
  detectPackageManager,
  wireMainTs,
  wireAppModule,
};

if (require.main === module) {
  run(process.argv, process.cwd()).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
