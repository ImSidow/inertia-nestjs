'use strict';

const fs = require('fs');
const path = require('path');

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

// Adds the @/* alias (so UI-lib CLIs like shadcn can detect it from the
// project root) and excludes the frontend from the root tsconfig.json.
// The exclude matters here separately from tsconfig.build.json's: VS Code
// and ESLint's projectService type-check using this file directly, not
// tsconfig.build.json (that one only affects `nest build`/`nest start`) —
// without excluding resources/vite.config.mts here too, the editor's live
// type-checker still pulls the frontend into the backend's TS program.
function patchRootTsconfig(cwd) {
  const filePath = path.join(cwd, 'tsconfig.json');
  const { value: tsconfig, error } = readJson(filePath);
  if (error) return { file: 'tsconfig.json', status: error };

  tsconfig.compilerOptions = tsconfig.compilerOptions || {};
  tsconfig.compilerOptions.paths = tsconfig.compilerOptions.paths || {};

  const aliasMissing = !tsconfig.compilerOptions.paths['@/*'];
  const exclude = Array.isArray(tsconfig.exclude) ? tsconfig.exclude : [];
  const excludeAdditions = ['resources', 'vite.config.mts'].filter((entry) => !exclude.includes(entry));

  if (!aliasMissing && excludeAdditions.length === 0) {
    return { file: 'tsconfig.json', status: 'already-present' };
  }

  if (aliasMissing) {
    tsconfig.compilerOptions.paths['@/*'] = ['./resources/js/*'];
  }
  if (excludeAdditions.length > 0) {
    tsconfig.exclude = exclude.concat(excludeAdditions);
  }

  writeJson(filePath, tsconfig);
  return { file: 'tsconfig.json', status: 'patched' };
}

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

// Vite's outDir for both builds lands inside directories Nest itself serves
// (public/build via useStaticAssets, bootstrap/ssr for the SSR bundle) —
// generated output, not source, so it shouldn't be committed.
const GITIGNORE_ENTRIES = ['/bootstrap', '/public/build'];

function patchGitignore(cwd) {
  const filePath = path.join(cwd, '.gitignore');
  if (!fs.existsSync(filePath)) return { file: '.gitignore', status: 'missing' };

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').map((line) => line.trim());
  const additions = GITIGNORE_ENTRIES.filter((entry) => !lines.includes(entry));

  if (additions.length === 0) return { file: '.gitignore', status: 'already-present' };

  const separator = content.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(filePath, `${content}${separator}\n# inertia-nestjs\n${additions.join('\n')}\n`);
  return { file: '.gitignore', status: 'patched', additions };
}

module.exports = {
  patchTsconfigBuildExclude,
  patchRootTsconfig,
  patchPackageJsonScripts,
  patchGitignore,
};
