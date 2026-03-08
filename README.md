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
- 🧪 **Testing utilities**
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
        {{#if ssrBody}}
        <div id="app" data-page="{{{json page}}}">{{{ssrBody}}}</div>
        {{else}}
        <div id="app" data-page="{{{json page}}}"></div>
        {{/if}}
    </body>
</html>
```

### EJS (`views/app.ejs`)

```html
<div id="app" data-page="<%- JSON.stringify(page) %>"></div>
```

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
async logout(@Res() res: Response) {
  this.inertia.location(res, 'https://example.com');
}
```

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
    },
});
```

If the SSR server is unavailable or the bundle is missing, the adapter automatically **falls back to client-side rendering**.

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

---

# Prop Helpers

| Helper              | Description                           |
| ------------------- | ------------------------------------- |
| `lazy(fn)`          | Only evaluated during partial reloads |
| `always(fn)`        | Always evaluated                      |
| `defer(fn, group?)` | Loaded asynchronously                 |
| `merge(fn)`         | Merge new data with existing          |

---

# License

MIT
