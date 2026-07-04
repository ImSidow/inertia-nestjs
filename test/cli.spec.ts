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
