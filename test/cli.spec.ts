import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const {
  isNestProject,
  copyTemplate,
  patchTsconfigBuildExclude,
  patchRootTsconfigAlias,
  patchPackageJsonScripts,
  detectPackageManager,
  wireMainTs,
  wireAppModule,
} = require('../bin/cli') as {
  isNestProject: (cwd: string) => boolean;
  copyTemplate: (
    templateDir: string,
    targetDir: string,
  ) => { created: string[]; skipped: string[] };
  patchTsconfigBuildExclude: (cwd: string) => { file: string; status: string; additions?: string[] };
  patchRootTsconfigAlias: (cwd: string) => { file: string; status: string };
  patchPackageJsonScripts: (cwd: string) => { file: string; status: string; additions?: string[] };
  detectPackageManager: (cwd: string) => string;
  wireMainTs: (cwd: string) => { file: string; status: string };
  wireAppModule: (cwd: string) => { file: string; status: string };
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

describe('patchPackageJsonScripts', () => {
  it('adds all five scripts to a package.json with no scripts field', () => {
    const dir = mkTempDir();
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }));

    const result = patchPackageJsonScripts(dir);

    expect(result.status).toBe('patched');
    const written = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    expect(written.scripts).toEqual({
      'dev:client': 'vite build --watch',
      'build:client': 'vite build',
      'build:server': 'vite build --ssr resources/js/ssr.tsx',
      'build:ssr': 'npm run build:client && npm run build:server',
      'serve:ssr': 'node bootstrap/ssr/ssr.js',
    });
  });

  it('preserves existing scripts and only adds the missing ones', () => {
    const dir = mkTempDir();
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ scripts: { start: 'nest start', 'dev:client': 'custom' } }),
    );

    const result = patchPackageJsonScripts(dir);

    expect(result.status).toBe('patched');
    const written = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    expect(written.scripts.start).toBe('nest start');
    expect(written.scripts['dev:client']).toBe('custom');
    expect(written.scripts['build:client']).toBe('vite build');
  });

  it('is idempotent — reports already-present when all scripts exist', () => {
    const dir = mkTempDir();
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }));

    patchPackageJsonScripts(dir);
    const second = patchPackageJsonScripts(dir);

    expect(second.status).toBe('already-present');
  });

  it('reports missing when package.json does not exist', () => {
    const dir = mkTempDir();

    expect(patchPackageJsonScripts(dir)).toEqual({ file: 'package.json', status: 'missing' });
  });
});

describe('wireMainTs', () => {
  const DEFAULT_MAIN_TS = `import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
`;

  it('wires a default-shaped main.ts with static assets and the hbs view engine', () => {
    const dir = mkTempDir();
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'main.ts'), DEFAULT_MAIN_TS);

    const result = wireMainTs(dir);

    expect(result.status).toBe('patched');
    const written = fs.readFileSync(path.join(dir, 'src', 'main.ts'), 'utf8');
    expect(written).toContain("import { NestExpressApplication } from '@nestjs/platform-express';");
    expect(written).toContain("import { join } from 'node:path';");
    expect(written).toContain("import hbs from 'hbs';");
    expect(written).toContain('NestFactory.create<NestExpressApplication>(AppModule)');
    expect(written).toContain("app.useStaticAssets(join(process.cwd(), 'public'));");
    expect(written).toContain("app.setViewEngine('hbs');");
    expect(written).toContain("hbs.registerHelper('json', (value) => JSON.stringify(value));");
    expect(written).toContain('await app.listen(process.env.PORT ?? 3000);');
  });

  it('is idempotent — reports already-present and does not duplicate on a second run', () => {
    const dir = mkTempDir();
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'main.ts'), DEFAULT_MAIN_TS);

    wireMainTs(dir);
    const second = wireMainTs(dir);

    expect(second.status).toBe('already-present');
    const written = fs.readFileSync(path.join(dir, 'src', 'main.ts'), 'utf8');
    expect(written.match(/registerHelper\('json'/g)).toHaveLength(1);
  });

  it('reports shape-mismatch and leaves the file untouched when already customized', () => {
    const dir = mkTempDir();
    fs.mkdirSync(path.join(dir, 'src'));
    const customized = `import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  await app.listen(3000);
}
bootstrap();
`;
    fs.writeFileSync(path.join(dir, 'src', 'main.ts'), customized);

    const result = wireMainTs(dir);

    expect(result.status).toBe('shape-mismatch');
    expect(fs.readFileSync(path.join(dir, 'src', 'main.ts'), 'utf8')).toBe(customized);
  });

  it('reports missing when src/main.ts does not exist', () => {
    const dir = mkTempDir();

    expect(wireMainTs(dir)).toEqual({ file: 'src/main.ts', status: 'missing' });
  });
});

describe('wireAppModule', () => {
  const DEFAULT_APP_MODULE = `import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
`;

  it('wires a default-shaped app.module.ts to register InertiaModule', () => {
    const dir = mkTempDir();
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'app.module.ts'), DEFAULT_APP_MODULE);

    const result = wireAppModule(dir);

    expect(result.status).toBe('patched');
    const written = fs.readFileSync(path.join(dir, 'src', 'app.module.ts'), 'utf8');
    expect(written).toContain(
      "import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';",
    );
    expect(written).toContain("import { HandleInertiaRequests, InertiaModule } from 'inertia-nestjs';");
    expect(written).toContain('InertiaModule.forRoot({');
    expect(written).toContain('export class AppModule implements NestModule {');
    expect(written).toContain("consumer.apply(HandleInertiaRequests).forRoutes('*');");
    expect(written).toContain('AppController');
    expect(written).toContain('AppService');
  });

  it('is idempotent — reports already-present on a second run', () => {
    const dir = mkTempDir();
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'app.module.ts'), DEFAULT_APP_MODULE);

    wireAppModule(dir);
    const second = wireAppModule(dir);

    expect(second.status).toBe('already-present');
  });

  it('reports shape-mismatch and leaves the file untouched when imports is not empty', () => {
    const dir = mkTempDir();
    fs.mkdirSync(path.join(dir, 'src'));
    const customized = `import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
`;
    fs.writeFileSync(path.join(dir, 'src', 'app.module.ts'), customized);

    const result = wireAppModule(dir);

    expect(result.status).toBe('shape-mismatch');
    expect(fs.readFileSync(path.join(dir, 'src', 'app.module.ts'), 'utf8')).toBe(customized);
  });

  it('reports missing when src/app.module.ts does not exist', () => {
    const dir = mkTempDir();

    expect(wireAppModule(dir)).toEqual({ file: 'src/app.module.ts', status: 'missing' });
  });
});
