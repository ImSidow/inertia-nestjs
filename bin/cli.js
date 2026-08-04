#!/usr/bin/env node
'use strict';

const path = require('path');
const { isNestProject } = require('./lib/nest-project');
const { copyTemplate } = require('./lib/copy-template');
const {
  patchTsconfigBuildExclude,
  patchRootTsconfig,
  patchPackageJsonScripts,
  patchGitignore,
} = require('./lib/json-patches');
const {
  DEPENDENCIES,
  DEV_DEPENDENCIES,
  detectPackageManager,
  installPackages,
  installDependencies,
} = require('./lib/install');
const { wireMainTs, wireAppModule } = require('./lib/wire-source');
const { promptYesNo } = require('./lib/prompt');

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
   npm install -D @types/hbs

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
   npm install -D ${DEV_DEPENDENCIES.join(' ')} --legacy-peer-deps
`;
}

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

function requireNestProject(cwd) {
  if (isNestProject(cwd)) return true;

  console.error(
    "This doesn't look like a NestJS project (no @nestjs/core dependency found in package.json). Run this from your Nest project root.",
  );
  process.exitCode = 1;
  return false;
}

function runSkill(cwd) {
  if (!requireNestProject(cwd)) return;

  const skillDir = path.join(__dirname, '..', 'skill');
  const { created, skipped } = copyTemplate(skillDir, cwd);

  for (const file of created) console.log(`created  ${file}`);
  for (const file of skipped) console.log(`skipped  ${file} (already exists)`);
}

async function runReact(cwd) {
  if (!requireNestProject(cwd)) return;

  const templateDir = path.join(__dirname, '..', 'templates', 'react');
  const { created, skipped } = copyTemplate(templateDir, cwd);

  for (const file of created) console.log(`created  ${file}`);
  for (const file of skipped) console.log(`skipped  ${file} (already exists)`);

  logPatchResult(patchTsconfigBuildExclude(cwd));
  logPatchResult(patchRootTsconfig(cwd));
  logPatchResult(patchPackageJsonScripts(cwd));
  logPatchResult(patchGitignore(cwd));

  const { manager, success } = installDependencies(cwd);
  console.log(success ? `installed dependencies via ${manager}` : manualInstallFallback(manager));

  const wireMain = await promptYesNo(
    '\nAuto-wire src/main.ts for the Handlebars view engine and static assets?',
  );
  if (wireMain) {
    const mainResult = wireMainTs(cwd);
    reportWireResult(mainResult, MAIN_TS_SNIPPET);
    if (mainResult.status === 'patched' && success) {
      console.log(`\nInstalling hbs with ${manager}...`);
      installPackages(manager, cwd, ['hbs'], false);
      installPackages(manager, cwd, ['@types/hbs'], true);
    }
  } else {
    console.log(MAIN_TS_SNIPPET);
  }

  const wireModule = await promptYesNo('\nAuto-wire src/app.module.ts to register InertiaModule?');
  if (wireModule) {
    reportWireResult(wireAppModule(cwd), APP_MODULE_SNIPPET);
  } else {
    console.log(APP_MODULE_SNIPPET);
  }
}

async function run(argv, cwd) {
  const subcommand = argv[2];

  if (subcommand === 'skill') return runSkill(cwd);
  if (subcommand === 'react') return runReact(cwd);

  console.error(`Usage: inertia-nestjs react | inertia-nestjs skill\n\nUnknown subcommand: ${subcommand || '(none)'}`);
  process.exitCode = 1;
}

module.exports = {
  run,
  isNestProject,
  copyTemplate,
  patchTsconfigBuildExclude,
  patchRootTsconfig,
  patchPackageJsonScripts,
  patchGitignore,
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
