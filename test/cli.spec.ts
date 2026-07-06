import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const {
  isNestProject,
  copyTemplate,
  patchTsconfigBuildExclude,
  patchRootTsconfigAlias,
  detectPackageManager,
} = require('../bin/cli') as {
  isNestProject: (cwd: string) => boolean;
  copyTemplate: (
    templateDir: string,
    targetDir: string,
  ) => { created: string[]; skipped: string[] };
  patchTsconfigBuildExclude: (cwd: string) => { file: string; status: string; additions?: string[] };
  patchRootTsconfigAlias: (cwd: string) => { file: string; status: string };
  detectPackageManager: (cwd: string) => string;
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

  it('returns false when package.json is malformed JSON', () => {
    const dir = mkTempDir();
    fs.writeFileSync(path.join(dir, 'package.json'), '{ not valid json');

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

describe('patchTsconfigBuildExclude', () => {
  it('adds resources and vite.config.mts to an existing exclude array', () => {
    const dir = mkTempDir();
    fs.writeFileSync(
      path.join(dir, 'tsconfig.build.json'),
      JSON.stringify({ extends: './tsconfig.json', exclude: ['node_modules', 'dist'] }),
    );

    const result = patchTsconfigBuildExclude(dir);

    expect(result.status).toBe('patched');
    const written = JSON.parse(fs.readFileSync(path.join(dir, 'tsconfig.build.json'), 'utf8'));
    expect(written.exclude).toEqual(['node_modules', 'dist', 'resources', 'vite.config.mts']);
  });

  it('is idempotent — a second run reports already-present and does not duplicate entries', () => {
    const dir = mkTempDir();
    fs.writeFileSync(
      path.join(dir, 'tsconfig.build.json'),
      JSON.stringify({ exclude: ['node_modules', 'dist'] }),
    );

    patchTsconfigBuildExclude(dir);
    const second = patchTsconfigBuildExclude(dir);

    expect(second.status).toBe('already-present');
    const written = JSON.parse(fs.readFileSync(path.join(dir, 'tsconfig.build.json'), 'utf8'));
    expect(written.exclude).toEqual(['node_modules', 'dist', 'resources', 'vite.config.mts']);
  });

  it('reports missing when tsconfig.build.json does not exist', () => {
    const dir = mkTempDir();

    expect(patchTsconfigBuildExclude(dir)).toEqual({ file: 'tsconfig.build.json', status: 'missing' });
  });

  it('reports invalid-json without throwing when the file is malformed', () => {
    const dir = mkTempDir();
    fs.writeFileSync(path.join(dir, 'tsconfig.build.json'), '{ not valid json');

    expect(patchTsconfigBuildExclude(dir)).toEqual({ file: 'tsconfig.build.json', status: 'invalid-json' });
  });
});

describe('patchRootTsconfigAlias', () => {
  it('adds the @/* alias when compilerOptions.paths is absent', () => {
    const dir = mkTempDir();
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));

    const result = patchRootTsconfigAlias(dir);

    expect(result.status).toBe('patched');
    const written = JSON.parse(fs.readFileSync(path.join(dir, 'tsconfig.json'), 'utf8'));
    expect(written.compilerOptions.paths['@/*']).toEqual(['./resources/js/*']);
  });

  it('leaves an existing @/* alias untouched and reports already-present', () => {
    const dir = mkTempDir();
    fs.writeFileSync(
      path.join(dir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { paths: { '@/*': ['./custom/*'] } } }),
    );

    const result = patchRootTsconfigAlias(dir);

    expect(result.status).toBe('already-present');
    const written = JSON.parse(fs.readFileSync(path.join(dir, 'tsconfig.json'), 'utf8'));
    expect(written.compilerOptions.paths['@/*']).toEqual(['./custom/*']);
  });

  it('reports missing when tsconfig.json does not exist', () => {
    const dir = mkTempDir();

    expect(patchRootTsconfigAlias(dir)).toEqual({ file: 'tsconfig.json', status: 'missing' });
  });
});

describe('detectPackageManager', () => {
  it('detects pnpm from pnpm-lock.yaml', () => {
    const dir = mkTempDir();
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');

    expect(detectPackageManager(dir)).toBe('pnpm');
  });

  it('detects yarn from yarn.lock', () => {
    const dir = mkTempDir();
    fs.writeFileSync(path.join(dir, 'yarn.lock'), '');

    expect(detectPackageManager(dir)).toBe('yarn');
  });

  it('detects bun from bun.lock', () => {
    const dir = mkTempDir();
    fs.writeFileSync(path.join(dir, 'bun.lock'), '');

    expect(detectPackageManager(dir)).toBe('bun');
  });

  it('detects npm from package-lock.json', () => {
    const dir = mkTempDir();
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '');

    expect(detectPackageManager(dir)).toBe('npm');
  });

  it('defaults to npm when no lockfile is present', () => {
    const dir = mkTempDir();

    expect(detectPackageManager(dir)).toBe('npm');
  });

  it('prefers pnpm over npm when both lockfiles are present', () => {
    const dir = mkTempDir();
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '');
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');

    expect(detectPackageManager(dir)).toBe('pnpm');
  });
});
