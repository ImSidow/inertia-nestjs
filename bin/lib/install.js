'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEPENDENCIES = ['@inertiajs/react', '@inertiajs/vite', 'react', 'react-dom'];
const DEV_DEPENDENCIES = ['vite', '@vitejs/plugin-react', '@types/react', '@types/react-dom'];

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
// differs per manager — not just the binary name. npm's dev install also
// needs --legacy-peer-deps: @vitejs/plugin-react currently has a strict
// peer conflict (a @babel/core 7 vs 8 mismatch pulled in transitively)
// that npm 7+'s default resolver refuses to satisfy, even though the
// packages themselves work fine together at runtime.
const INSTALL_ARGS = {
  npm: { add: ['install'], addDev: ['install', '-D', '--legacy-peer-deps'] },
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

function installDependencies(cwd) {
  const manager = detectPackageManager(cwd);

  console.log(`\nInstalling dependencies with ${manager}...`);
  const depsOk = installPackages(manager, cwd, DEPENDENCIES, false);
  const devDepsOk = depsOk && installPackages(manager, cwd, DEV_DEPENDENCIES, true);

  return { manager, success: depsOk && devDepsOk };
}

module.exports = {
  DEPENDENCIES,
  DEV_DEPENDENCIES,
  detectPackageManager,
  installPackages,
  installDependencies,
};
