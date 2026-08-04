# inertia-nestjs

> A platform-agnostic Inertia.js adapter for NestJS (Express, Fastify, and any Nest HTTP adapter) — inspired by inertia-laravel.

[![npm version](https://img.shields.io/npm/v/inertia-nestjs.svg?style=flat-square)](https://www.npmjs.com/package/inertia-nestjs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Features

- 🚀 **Platform agnostic** — works with Express, Fastify, or any NestJS HTTP adapter
- ⚡ **Inertia.js protocol compliant**
- 🧩 **Decorator-based API** (`@Inertia()`)
- 🪶 **Lazy, deferred, merge, and always props**
- 🔁 **Partial reload support**
- 🔐 **History encryption**
- 🌐 **Optional Server‑Side Rendering (SSR)**
- ✅ **Validation error flashing and exception handling** (`@InertiaValidate()`, `@InertiaHandleException()`)
- 🧪 **Testing utilities**
- ⚙️ **CLI scaffolding** (`npx inertia-nestjs react`)
- 📦 **Inspired by `inertia-laravel`**

---

# Installation

```bash
npm install inertia-nestjs
```

You will also need an Inertia client adapter depending on your frontend:

```bash
npm install @inertiajs/react
# or
npm install @inertiajs/vue3
```

---

# Scaffolding

Two CLI commands are available once the package is installed:

```bash
npx inertia-nestjs react
```

Scaffolds a React + Vite frontend into the current NestJS project.

```bash
npx inertia-nestjs skill
```

Installs a Claude Code skill (`.claude/skills/inertia-nestjs/SKILL.md`) documenting this adapter's API and common gotchas, for AI coding assistants working in your project.

---

# Quick Start

## 1. Register the module

```ts
// app.module.ts
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { InertiaModule, HandleInertiaRequests } from 'inertia-nestjs';

@Module({
    imports: [
        InertiaModule.forRoot({
            rootView: 'app', // template rendered on first page load
            version: '1.0.0', // asset version for cache-busting
        }),
    ],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(HandleInertiaRequests).forRoutes('*');
    }
}
```

---

# Root Template

Inertia requires a root HTML template that embeds the serialized page object.

### Handlebars (`views/app.hbs`)

```html
<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <title>My App</title>

        <link rel="stylesheet" href="/build/app.css" />
        <script type="module" src="/build/app.js" defer></script>

        {{#each ssrHead}} {{{this}}} {{/each}}
    </head>

    <body>
        <script type="application/json" data-page="app">{{{json page}}}</script>

        {{#if ssrBody}}
        <div id="app">{{{ssrBody}}}</div>
        {{else}}
        <div id="app"></div>
        {{/if}}
    </body>
</html>
```

> The client reads the page object from a `<script type="application/json" data-page="app">` tag, **not** a `data-page` attribute on the `#app` div — that older pattern doesn't get picked up by `@inertiajs/core` and the page never hydrates.

### EJS (`views/app.ejs`)

```html
<script type="application/json" data-page="app"><%- JSON.stringify(page) %></script>
<div id="app"></div>
```

---

## Wiring `main.ts`

The Handlebars view engine and the built frontend's static assets need to be wired up in your bootstrap file:

```ts
// main.ts
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import hbs from 'hbs';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    app.useStaticAssets(join(process.cwd(), 'public'));
    app.setBaseViewsDir(join(process.cwd(), 'views'));
    app.setViewEngine('hbs');
    hbs.registerHelper('json', (value) => JSON.stringify(value));

    await app.listen(3000);
}
bootstrap();
```

Requires `npm install hbs @types/hbs`. Skipping `useStaticAssets` is a common mistake — without it, the built client bundle 404s and the page stays blank even though the server-rendered HTML looks correct.

---

# Controller Usage

## Using the `@Inertia()` decorator

```ts
import { Controller, Get, Param } from '@nestjs/common';
import { Inertia } from 'inertia-nestjs';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
    constructor(private readonly users: UsersService) {}

    @Get()
    @Inertia('Users/Index')
    async index() {
        return {
            users: await this.users.findAll(),
        };
    }

    @Get(':id')
    @Inertia('Users/Show')
    async show(@Param('id') id: string) {
        return {
            user: await this.users.findOne(id),
        };
    }
}
```

---

# Validation & Exception Handling

## `@InertiaValidate()`

Catches `class-validator` errors, flashes them, and redirects back — the client reads them from `usePage().props.errors` (or `useForm`'s `errors`) after the redirect.

```ts
import { InertiaValidate } from 'inertia-nestjs';

@Post('users')
@InertiaValidate() // or @InertiaValidate('Users/Create') to redirect to a specific component instead of back
async create(@Body() dto: CreateUserDto) {
    await this.users.create(dto);
}
```

## `@InertiaHandleException()`

Catches HTTP exceptions thrown in the handler, flashes the message as an error, and redirects back (or to `returnPath` if given). Shares the same underlying mechanism as `@InertiaValidate()`.

```ts
import { InertiaHandleException } from 'inertia-nestjs';

@Post('orders/:id')
@InertiaHandleException({ codes: [404, 409], returnPath: '/orders' })
async update(@Param('id') id: string) {
    await this.orders.update(id);
}
```

Omit `codes` to catch all HTTP exceptions thrown in that handler.

---

# Rendering Manually with `InertiaService`

You may render pages manually if you need full control.

```ts
import { Controller, Get, Req, Res } from '@nestjs/common';
import { InertiaService } from 'inertia-nestjs';
import { Request, Response } from 'express';

@Controller('dashboard')
export class DashboardController {
    constructor(private readonly inertia: InertiaService) {}

    @Get()
    async index(@Req() req: Request, @Res() res: Response) {
        return this.inertia.render(req, res, 'Dashboard', {
            props: {
                stats: await this.getStats(),
            },
            encryptHistory: true,
        });
    }
}
```

---

# Sharing Props

Share data with **all Inertia pages** (for example auth user or flash messages).

## Option A — in `InertiaModule.forRoot()`

```ts
InertiaModule.forRoot({
    sharedProps: {
        appName: 'My App',
    },
});
```

---

## Option B — extend `HandleInertiaRequests`

Recommended for **per-request data**.

```ts
import { Injectable } from '@nestjs/common';
import { HandleInertiaRequests, InertiaService } from 'inertia-nestjs';
import { Request } from 'express';

@Injectable()
export class CustomInertiaMiddleware extends HandleInertiaRequests {
    constructor(inertia: InertiaService) {
        super(inertia);
    }

    async share(req: Request) {
        return {
            ...(await super.share(req)),

            auth: {
                user: (req as any).user
                    ? {
                          id: (req as any).user.id,
                          name: (req as any).user.name,
                      }
                    : null,
            },

            flash: {
                message: (req.session as any)?.flash,
            },
        };
    }
}
```

Register it:

```ts
consumer.apply(CustomInertiaMiddleware).forRoutes('*');
```

**Gotcha — middleware runs before guards.** `HandleInertiaRequests` is Nest middleware, which always executes before guards in Nest's request pipeline. If your auth sets `req.user` via a Guard (not earlier middleware), it won't be populated yet when `share(req)` runs above. Either populate `req.user` via middleware instead of a guard, or have your `share()` override call your auth library's session lookup directly (e.g. `auth.api.getSession()`) instead of reading `req.user`.

**`InertiaService.share(key, value, req)`** — pass `req` when calling this directly in a controller/service. `InertiaService` is a singleton; without `req`, the value is written globally onto the singleton's own state and can leak into other concurrent requests' responses. The middleware pattern above already passes `req` internally, so extending `HandleInertiaRequests` (as shown) is unaffected — this only matters if you call `.share()` yourself outside of that pattern.

---

# Lazy Props

Lazy props are evaluated **only when explicitly requested during partial reloads**.

```ts
import { lazy } from 'inertia-nestjs';

@Get()
@Inertia('Users/Index')
async index() {
  return {
    users: await this.users.findAll(),
    permissions: lazy(() => this.getPermissions()),
  };
}
```

---

# Always Props

Always props are included on **every request**, even if not requested.

```ts
import { always } from 'inertia-nestjs';

return {
    auth: always(() => ({ user: req.user })),
};
```

---

# Deferred Props

Deferred props are sent **after the initial page render**.

```ts
import { defer } from 'inertia-nestjs';

@Get()
@Inertia('Reports/Show')
async show() {
  return {
    summary: 'Quick summary',
    chartData: defer(() => this.buildChartData()),
    tableData: defer(() => this.buildTable(), 'table'),
  };
}
```

---

# Merge Props

Merge props allow the client to **merge new data with existing state**.

```ts
import { merge } from 'inertia-nestjs';

@Get()
@Inertia('Feed')
async index() {
  return {
    posts: merge(() => this.posts.paginate()),
  };
}
```

---

# Asset Versioning

Force a full reload when assets change.

```ts
InertiaModule.forRoot({
    version: '1.2.3',
});
```

Dynamic version example:

```ts
version: () => readFileSync('public/build/manifest.json').toString();
```

---

# External Redirects

To redirect outside the SPA:

```ts
@Post('logout')
async logout(@Req() req: Request, @Res() res: Response) {
  this.inertia.location(req, res, 'https://example.com');
}
```

---

# Flash Data

Flash one-off data (e.g. a success toast) to be read on the **next** request only, separate from validation `errors`.

```ts
@Post('users')
async create(@Body() dto: CreateUserDto, @Res() res: Response) {
  await this.users.create(dto);

  this.inertia.flash(res, { message: 'User created!' });
  res.redirect(303, '/users');
}
```

Client reads it via `usePage().props.flash.message` on the next page.

---

# History Encryption

Encrypt a page's browser history entry.

```ts
@Inertia('Payments/New', { encryptHistory: true })
newPayment() {}
```

---

# Server‑Side Rendering (SSR)

`inertia-nestjs` supports optional **server-side rendering**.

Enable SSR:

```ts
InertiaModule.forRoot({
    rootView: 'app',
    version: '1.0.0',

    ssr: {
        enabled: true,
        url: 'http://127.0.0.1:13714',
        bundlePath: 'bootstrap/ssr/ssr.js',
        exclude: ['/admin/*'], // skip SSR for these routes (falls back to CSR)
    },
});
```

If the SSR server is unavailable or the bundle is missing, the adapter automatically **falls back to client-side rendering**.

`exclude` takes glob patterns matched against the page URL: a plain path (`/admin`) matches only that exact path; append `*` (`/admin/*`) to match everything under it. Useful for excluding auth-gated dashboards from SSR while keeping it for public/SEO-critical pages.

For a one-off route that doesn't fit cleanly into a URL pattern (e.g. a single page using a browser-only widget), skip SSR per-route instead:

```ts
@Get('reports/:id/live-chart')
@Inertia('Reports/LiveChart', { ssr: false })
show() { ... }
```

---

# Example SSR Entry

```ts
import { createInertiaApp } from '@inertiajs/react';
import createServer from '@inertiajs/react/server';
import ReactDOMServer from 'react-dom/server';

createServer(page =>
  createInertiaApp({
    page,
    render: ReactDOMServer.renderToString,

    resolve: async name => {
      const pages = import.meta.glob('./pages/**/*.tsx');
      const module = await pages[`./pages/${name}.tsx`]();
      return module.default;
    },

    setup: ({ App, props }) => <App {...props} />,
  }),
);
```

---

# Testing

```ts
import { assertInertia, assertInertiaLocation } from 'inertia-nestjs';
import * as request from 'supertest';

it('returns users page', async () => {
    const res = await request(app.getHttpServer())
        .get('/users')
        .set('X-Inertia', 'true')
        .set('X-Inertia-Version', '1.0.0')
        .expect(200);

    assertInertia(res.body, (page) => {
        page.component('Users/Index')
            .has('users')
            .where('users[0].name', 'Alice');
    });
});

it('redirects to external URL', async () => {
    const res = await request(app.getHttpServer())
        .post('/logout')
        .set('X-Inertia', 'true')
        .expect(409);

    assertInertiaLocation(res.headers, 'https://example.com');
});
```

---

# API Reference

### `InertiaModule.forRoot(options)`

| Option         | Type                   | Default     | Description                   |
| -------------- | ---------------------- | ----------- | ----------------------------- |
| rootView       | string                 | `'app'`     | Root template                 |
| version        | string \| () => string | `''`        | Asset version                 |
| sharedProps    | object                 | `{}`        | Props shared with all pages   |
| encryptHistory | boolean                | `false`     | Encrypt history for all pages |
| ssr            | object                 | `undefined` | SSR configuration             |

### `InertiaModule.forRootAsync(options)`

For config-driven setup — same shape as any Nest async provider:

```ts
InertiaModule.forRootAsync({
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
        rootView: 'app',
        version: config.get('ASSET_VERSION'),
    }),
});
```

---

# Prop Helpers

| Helper              | Description                           |
| ------------------- | ------------------------------------- |
| `lazy(fn)`          | Only evaluated during partial reloads |
| `always(fn)`        | Always evaluated                      |
| `defer(fn, group?, rescue?)` | Loaded asynchronously; `rescue: true` resolves to `null` instead of failing the request if `fn` throws |
| `merge(fn)`         | Merge new data with existing          |

---

# License

MIT
