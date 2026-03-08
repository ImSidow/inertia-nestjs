# inertia-nestjs

> A platform-agnostic Inertia.js adapter for NestJS (Express, Fastify, and any Nest HTTP adapter) — inspired by inertia-laravel.

[![npm version](https://img.shields.io/npm/v/inertia-nestjs.svg?style=flat-square)](https://www.npmjs.com/package/inertia-nestjs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Features

- 🚀 **Platform agnostic** — works with Express, Fastify, or any NestJS HTTP adapter
- ⚡ **Inertia.js protocol compliant**
- 🧩 **Decorator-based API** (`@Inertia()`)
- 🪶 **Lazy, deferred, merge, and always props**
- 🔁 **Partial reload support**
- 🔐 **History encryption**
- 🧪 **Testing utilities**
- 📦 **Inspired by `inertia-laravel`**

---

## Installation

```bash
npm install inertia-nestjs
```

---

## Quick Start

### 1. Register the module

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
        // Apply the Inertia middleware to all routes
        consumer.apply(HandleInertiaRequests).forRoutes('*');
    }
}
```

### 2. Set up your root template (e.g. Handlebars / EJS)

Inertia needs a root HTML template that embeds the serialized page object.

**Handlebars (`views/app.hbs`)**:

```html
<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>My App</title>
        <link rel="stylesheet" href="/build/app.css" />
        <script type="module" src="/build/app.js" defer></script>
    </head>
    <body>
        <div id="app" data-page="{{{json page}}}"></div>
    </body>
</html>
```

**EJS (`views/app.ejs`)**:

```html
<div id="app" data-page="<%- JSON.stringify(page) %>"></div>
```

### 3. Use the `@Inertia()` decorator in a controller

```ts
// users.controller.ts
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

### 4. Or call `InertiaService.render()` directly (for fine-grained control)

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

## Sharing Props

Share data with **all** Inertia pages (e.g. auth user, flash messages).

### Option A — in `InertiaModule.forRoot()`

```ts
InertiaModule.forRoot({
    sharedProps: {
        appName: 'My App',
    },
});
```

### Option B — extend `HandleInertiaRequests`

This is the recommended approach for per-request data (like the authenticated user):

```ts
// handle-inertia-requests.middleware.ts
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
                    ? { id: (req as any).user.id, name: (req as any).user.name }
                    : null,
            },
            flash: {
                message: (req.session as any)?.flash,
            },
        };
    }
}
```

Then register your custom middleware instead:

```ts
consumer.apply(CustomInertiaMiddleware).forRoutes('*');
```

### Option C — call `inertia.share()` in a service or provider

```ts
inertia.share('appName', 'My App');
inertia.share('auth', () => ({ user: request.user }));
```

---

## Lazy Props

Lazy props are **only** evaluated during partial reloads that explicitly request them.
This is useful for expensive data that isn't needed on every visit.

```ts
import { lazy } from 'inertia-nestjs';

@Get()
@Inertia('Users/Index')
async index() {
  return {
    users: await this.users.findAll(),        // always included
    permissions: lazy(() => this.getPerms()), // only on partial reload
  };
}
```

---

## Always Props

Always props are included on **every** request, including partial reloads that
don't explicitly list them.

```ts
import { always } from 'inertia-nestjs';

return {
    auth: always(() => ({ user: req.user })),
};
```

---

## Deferred Props

Deferred props are sent in a **separate async request** after the initial page
load — great for heavy data that shouldn't block the initial render.

```ts
import { defer } from 'inertia-nestjs';

@Get()
@Inertia('Reports/Show')
async show() {
  return {
    summary: 'Quick summary',                          // sent immediately
    chartData: defer(() => this.buildChartData()),     // async, default group
    tableData: defer(() => this.buildTable(), 'table'), // async, 'table' group
  };
}
```

---

## Merge Props

Merge props tell the client to **merge** new data with existing data instead of
replacing it (useful for infinite scroll / pagination).

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

## Asset Versioning

Set the current asset version to trigger a full page reload when assets change:

```ts
InertiaModule.forRoot({
    version: '1.2.3',
    // Or a factory:
    version: () => readFileSync('public/mix-manifest.json').toString(),
});
```

When the client's version header doesn't match, the middleware automatically
responds with `409 Conflict` + `X-Inertia-Location`, causing the Inertia client
to do a full reload.

---

## External Redirects (location)

To redirect to an external URL (or force a full page visit):

```ts
@Post('logout')
async logout(@Res() res: Response) {
  // clears session...
  this.inertia.location(res, 'https://example.com');
}
```

---

## History Encryption

Encrypt a page's browser history entry:

```ts
@Inertia('Payments/New', { encryptHistory: true })
newPayment() { ... }
```

---

## Testing

```ts
import { assertInertia, assertInertiaLocation } from 'inertia-nestjs';
import * as request from 'supertest';

it('returns an Inertia users page', async () => {
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

## API Reference

### `InertiaModule.forRoot(options)`

| Option           | Type                     | Default | Description                   |
| ---------------- | ------------------------ | ------- | ----------------------------- |
| `rootView`       | `string`                 | `'app'` | Root template name            |
| `version`        | `string \| () => string` | `''`    | Asset version                 |
| `sharedProps`    | `object \| () => object` | `{}`    | Props shared with all pages   |
| `encryptHistory` | `boolean`                | `false` | Encrypt history for all pages |

### `InertiaService`

| Method                                 | Description                |
| -------------------------------------- | -------------------------- |
| `render(req, res, component, options)` | Render an Inertia response |
| `location(res, url)`                   | External redirect          |
| `share(key, value)`                    | Share a prop globally      |
| `getShared(key?)`                      | Get shared prop(s)         |
| `flushShared()`                        | Clear all shared props     |
| `setVersion(version)`                  | Set asset version          |
| `getVersion()`                         | Get current asset version  |
| `setRootView(name)`                    | Set root template name     |

### Prop helpers

| Helper              | Description                                                   |
| ------------------- | ------------------------------------------------------------- |
| `lazy(fn)`          | Only evaluated during partial reloads that request this prop  |
| `always(fn)`        | Always evaluated, even if not in partial reload's `only` list |
| `defer(fn, group?)` | Sent in a separate async request after initial load           |
| `merge(fn)`         | Client merges data instead of replacing it                    |

---

## License

MIT
