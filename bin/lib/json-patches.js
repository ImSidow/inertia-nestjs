'use strict';

const fs = require('fs');
const path = require('path');

// tsconfig files are JSONC: comments and trailing commas are allowed. Strip
// both (outside strings) so they can be read; `commented` tells the patches
// not to rewrite them, since writing JSON back would delete the comments.
function stripJsonc(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else {
      out += c;
    }
  }
  // Trailing commas: a comma followed only by whitespace before } or ].
  let result = '';
  inString = false;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (inString) {
      result += c;
      if (c === '\\') result += out[++i] ?? '';
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      result += c;
    } else if (c === ',' && /^\s*[}\]]/.test(out.slice(i + 1))) {
      // drop it
    } else {
      result += c;
    }
  }
  return result;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return { error: 'missing' };
  const text = fs.readFileSync(filePath, 'utf8');
  try {
    return { value: JSON.parse(text) };
  } catch {
    try {
      return { value: JSON.parse(stripJsonc(text)), commented: true };
    } catch {
      return { error: 'invalid-json' };
    }
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
  const { value: tsconfig, error, commented } = readJson(filePath);
  if (error) return { file: 'tsconfig.build.json', status: error };

  const exclude = Array.isArray(tsconfig.exclude) ? tsconfig.exclude : [];
  const additions = ['resources', 'vite.config.mts'].filter((entry) => !exclude.includes(entry));

  if (additions.length === 0) return { file: 'tsconfig.build.json', status: 'already-present' };
  if (commented) {
    return {
      file: 'tsconfig.build.json',
      status: 'manual',
      instructions: `add to "exclude": ${additions.map((a) => JSON.stringify(a)).join(', ')}`,
    };
  }

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
  const { value: tsconfig, error, commented } = readJson(filePath);
  if (error) return { file: 'tsconfig.json', status: error };

  tsconfig.compilerOptions = tsconfig.compilerOptions || {};
  tsconfig.compilerOptions.paths = tsconfig.compilerOptions.paths || {};

  const aliasMissing = !tsconfig.compilerOptions.paths['@/*'];
  const exclude = Array.isArray(tsconfig.exclude) ? tsconfig.exclude : [];
  const excludeAdditions = ['resources', 'vite.config.mts'].filter((entry) => !exclude.includes(entry));

  if (!aliasMissing && excludeAdditions.length === 0) {
    return { file: 'tsconfig.json', status: 'already-present' };
  }
  if (commented) {
    const steps = [];
    if (aliasMissing) steps.push('add to "compilerOptions.paths": "@/*": ["./resources/js/*"]');
    if (excludeAdditions.length) {
      steps.push(`add to "exclude": ${excludeAdditions.map((a) => JSON.stringify(a)).join(', ')}`);
    }
    return { file: 'tsconfig.json', status: 'manual', instructions: steps.join('; ') };
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

// The SSR bundle is an ES module: as `.mjs`, Node loads it without the
// "MODULE_TYPELESS_PACKAGE_JSON" warning a `.js` file gets in a CommonJS project.
function scriptsFor(ssrEntry) {
  return {
    'dev:client': 'vite build --watch',
    'build:client': 'vite build',
    'build:server': `vite build --ssr ${ssrEntry}`,
    'build:ssr': 'npm run build:client && npm run build:server',
    'serve:ssr': 'node bootstrap/ssr/ssr.mjs',
  };
}

function patchPackageJsonScripts(cwd, ssrEntry = 'resources/js/ssr.tsx') {
  const filePath = path.join(cwd, 'package.json');
  const { value: pkg, error } = readJson(filePath);
  if (error) return { file: 'package.json', status: error };

  const SCRIPTS = scriptsFor(ssrEntry);
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
  stripJsonc,
  patchTsconfigBuildExclude,
  patchRootTsconfig,
  patchPackageJsonScripts,
  patchGitignore,
};
