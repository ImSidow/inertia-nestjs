'use strict';

const fs = require('fs');
const path = require('path');

function insertAfterLastImport(content, newImportLines) {
  const importLines = [...content.matchAll(/^import .*;$/gm)];
  if (importLines.length === 0) return newImportLines.join('\n') + '\n' + content;

  const last = importLines[importLines.length - 1];
  const insertAt = last.index + last[0].length;
  return content.slice(0, insertAt) + '\n' + newImportLines.join('\n') + content.slice(insertAt);
}

// Only rewrites src/main.ts when it still matches the untouched `nest new`
// scaffold — a plain NestFactory.create(AppModule) call with no existing
// view-engine setup. Anything else (already customized, different variable
// name pattern, etc.) reports shape-mismatch rather than guessing an
// insertion point.
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

// Only rewrites src/app.module.ts when all three untouched-scaffold markers
// match — the plain `{ Module }` import, an empty imports array, and an
// empty class body. A single mismatch (an existing import, a non-empty
// imports array, custom class body) means the file was already customized,
// so this bails entirely rather than applying a partial edit.
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

module.exports = { wireMainTs, wireAppModule };
