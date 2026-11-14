# inertia-nestjs

> A platform-agnostic Inertia.js adapter for NestJS (Express and Fastify) — inspired by inertia-laravel.

[![npm version](https://img.shields.io/npm/v/inertia-nestjs.svg?style=flat-square)](https://www.npmjs.com/package/inertia-nestjs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Features

- 🚀 **Platform agnostic** — works with Express and Fastify (both tested in CI on NestJS 10, 11 and 12)
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

Supports NestJS 10, 11 and 12. NestJS 12 is published as ES modules; this package loads it through Node's `require()` of ES modules, which needs **Node 20.19+ or 22.12+**.

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
        {{#if ssrBody}}
        {{{ssrBody}}}
        {{else}}
        <script type="application/json" data-page="app">{{{json page}}}</script>
        <div id="app"></div>
        {{/if}}
    </body>
</html>
```

> The client reads the page object from a `<script type="application/json" data-page="app">` tag, **not** a `data-page` attribute on the `#app` div — that older pattern doesn't get picked up by `@inertiajs/core` and the page never hydrates.

> With SSR, output `ssrBody` **as-is** — the v3 SSR server already includes the page `<script>` and the `<div id="app" data-server-rendered>` root. Wrapping it in another `#app` div (or adding a second page script) makes the client mount on the wrong element and re-render from scratch instead of hydrating. Templates scaffolded before 1.6.0 have this bug; update `views/app.hbs` to match the one above.

### EJS (`views/app.ejs`)

```html
<script type="application/json" data-page="app"><%- JSON.stringify(page).replace(/</g, '\\u003c') %></script>
<div id="app"></div>
```

> **Always escape `<` in the page JSON.** A plain `JSON.stringify(page)` lets any prop containing `</script>` (e.g. a user's display name) break out of the tag and run script — an XSS hole. Replacing `<` with `\u003c` keeps the JSON valid and the tag closed.

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
    // Escaping `<` prevents a `</script>` inside any prop from breaking out of the tag (XSS).
    hbs.registerHelper('json', (value) => JSON.stringify(value).replace(/</g, '\\u003c'));

    await app.listen(3000);
}
bootstrap();
```

Requires `npm install hbs @types/hbs`. Skipping `useStaticAssets` is a common mistake — without it, the built client bundle 404s and the page stays blank even though the server-rendered HTML looks correct.

### Fastify

On Fastify, views render through [`@fastify/view`](https://github.com/fastify/point-of-view) and static files through `@fastify/static`:

```ts
// main.ts
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { join } from 'node:path';
import Handlebars from 'handlebars';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

    app.useStaticAssets({ root: join(process.cwd(), 'public') });
    // Escaping `<` prevents a `</script>` inside any prop from breaking out of the tag (XSS).
    Handlebars.registerHelper('json', (value) => JSON.stringify(value).replace(/</g, '\\u003c'));
    app.setViewEngine({
        engine: { handlebars: Handlebars },
        templates: join(process.cwd(), 'views'),
        viewExt: 'hbs',
    });

    await app.listen(3000);
}
bootstrap();
```

Requires `npm install @fastify/view @fastify/static handlebars`. On NestJS 10 (Fastify 4) use `@fastify/view@8` (the newest its Fastify adapter accepts). The same `views/app.hbs` template works on both platforms.

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

Register `InertiaValidationPipe` (a `ValidationPipe` with field-keyed errors) so each error lands next to its input. Nest's default `ValidationPipe` keeps only the messages, not which field they belong to.

```ts
// main.ts
import { InertiaValidationPipe } from 'inertia-nestjs';

app.useGlobalPipes(new InertiaValidationPipe({ whitelist: true })); // takes the usual ValidationPipe options
```

Errors arrive as `{ email: 'Enter a valid email address.' }`; nested DTOs use dot paths (`'address.city'`). Already have your own pipe setup? Pass `exceptionFactory: inertiaExceptionFactory` to it instead.

```ts
import { InertiaValidate } from 'inertia-nestjs';

@Post('users')
@InertiaValidate() // or @InertiaValidate('Users/Create') to redirect to a specific component instead of back
@Redirect('/users', 302) // optional: where to go on success
async create(@Body() dto: CreateUserDto) {
    await this.users.create(dto);
}
```

On success, a handler that uses `@Redirect()` (including a returned `{ url }`), renders an `@Inertia()` page, or sends its own response keeps control. Otherwise it redirects back to the previous page with `303`.

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

This also catches exceptions thrown by `@UseGuards()` — e.g. an auth guard rejecting the request — not just ones thrown in the handler body itself. Both decorators also work on a whole controller; a decorator on the method wins:

```ts
@Controller('settings')
@UseGuards(AuthGuard)
@InertiaHandleException({ codes: [401], returnPath: '/login' }) // every route: signed-out users go to /login
export class SettingsController {}
```

Plain browser requests (a bookmark, a new tab, a form without JavaScript) are redirected the same way as Inertia visits, with the errors flashed. Clients that ask for JSON only (`Accept: application/json`) still get the JSON error.

"Redirect back" only ever goes to a page on your own site: a `Referer` from another site (or a protocol-relative `//host` one) is ignored and the redirect goes to `/`.

## Error pages

Without this, errors nobody handled (an unknown route, a crash) reach the client as JSON, which it shows raw in its error dialog. `handleExceptionsUsing` renders a page of yours instead, with the error's status code:

```ts
InertiaModule.forRoot({
    handleExceptionsUsing: (error) => {
        if ([403, 404, 500, 503].includes(error.statusCode)) {
            return error.render('error', { status: error.statusCode });
        }
        // return nothing to keep the default response (e.g. for 418)
    },
});
```

- Works for Inertia visits and first visits (HTML, with SSR), on Express and Fastify. Shared props (auth user, app name) are included.
- `error.exception`, `error.request` and `error.statusCode` let you decide per error. Never pass `error.exception`'s message to the page — it may contain internals.
- Clients that ask for JSON only (`Accept: application/json`) keep the JSON error. Validation and `@InertiaHandleException` redirects are not affected.
- If the callback itself throws, the error is logged and the default response is sent.

Equivalent to inertia-laravel's `Inertia::handleExceptionsUsing()`.

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

Pass an options object for more control:

```ts
defer(() => this.comments.latest(), {
  group: 'comments',          // props in one group load in one request
  rescue: true,               // if it throws: omitted and listed in rescuedProps, not a failed request
  merge: { matchOn: 'id' },   // merge into existing client data (e.g. "load more"); takes merge() options
  // deepMerge: true,          // or deep-merge nested objects
});
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

Options:

```ts
import { merge, deepMerge } from 'inertia-nestjs';

merge(() => posts, { matchOn: 'id' });              // replace items with the same id instead of duplicating
merge(() => paginator, { at: 'data' });             // merge only paginator.data, replace the rest
merge(() => messages, { prepend: true });           // prepend instead of append
deepMerge(() => settings);                          // recursively merge nested objects
```

`matchOn` paths are relative to the prop, not to `at` — with `at: 'data'`, match on `'data.id'`.

A client reload with `reset: ['posts']` (sent as `X-Inertia-Reset`) replaces the prop instead of merging it.

---

# Once Props

Once props are resolved once and then remembered by the client, which skips them on later visits until they expire. Good for data that is expensive and rarely changes (permissions, plans, config).

```ts
import { once } from 'inertia-nestjs';

return {
  permissions: once(() => this.permissions.forUser(user), { expiresIn: 60 * 60 * 1000 }), // 1 hour
  plans: once(() => this.plans.all(), { key: 'plans-v2' }), // change the key to invalidate everyone's copy
  config: once(() => this.config.public(), { fresh: true }), // resend this time anyway
};
```

The client reports what it holds in `X-Inertia-Except-Once-Props`; those props are skipped on normal visits but always resolved on an explicit partial reload that asks for them.

Two things to know:

- **The client only reports once props on the page it is leaving.** A once prop used by a single page is sent again whenever the user comes back from another page. Once props pay off as **shared props** (from your `HandleInertiaRequests.share()`, present on every page) or for a page reloading itself.
- **Give user-specific once props a per-user `key`.** Otherwise the client keeps a guest's value after sign-in (or another user's after switching accounts) until it expires:

```ts
// in HandleInertiaRequests.share(req)
permissions: once(() => this.permissions.forUser(user), {
  key: `permissions:${user?.id ?? 'guest'}`,
  expiresIn: 60_000,
}),
```

---

# Infinite Scroll

`scroll()` feeds the client's `<InfiniteScroll>` component. Items under `wrapper` (default `'data'`) are appended as the user scrolls down, or prepended when scrolling up.

```ts
import { scroll } from 'inertia-nestjs';

@Get('posts')
@Inertia('Posts/Index')
async index(@Query('page') page = '1') {
  return {
    posts: scroll(() => this.posts.paginate(Number(page)), {
      // Pagination state for the client, from your paginator's shape:
      metadata: (p) => ({
        pageName: 'page',
        currentPage: p.page,
        previousPage: p.page > 1 ? p.page - 1 : null,
        nextPage: p.hasMore ? p.page + 1 : null,
      }),
      // wrapper: 'items',   // if the list isn't under `data`
      // defer: true,        // load after the first render
    }),
  };
}
```

---

# Nested Props & Partial Reloads

Prop helpers work at any depth, and partial reloads accept dot paths:

```ts
return {
  auth: {
    user: req.user,
    permissions: lazy(() => this.getPermissions()),
  },
  stats: { visits: defer(() => this.countVisits()) },  // deferredProps: { default: ['stats.visits'] }
};
```

```ts
router.reload({ only: ['auth.permissions'] }); // returns { auth: { permissions: [...] } }
router.reload({ except: ['auth.permissions'] });
```

Shared props (from `forRoot`, `share()` or your middleware) are listed by key in the page's `sharedProps`, which the v3 client uses to carry them over during instant visits. They are filtered by partial reloads like any other prop.

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

# URL Fragments in Redirects

Redirects to a URL with a fragment (`/posts/1#comments`) just work: for Inertia visits the middleware answers with `409` + `X-Inertia-Redirect`, and the client visits that URL with the fragment intact. Prefetches and plain browser requests get the redirect unchanged.

`preserveFragment()` keeps the fragment of the URL the client **requested** across your redirect. The browser never sends fragments to the server, so the client must request a URL that carries one — e.g. pass the current fragment along when posting from `/page#comments`:

```tsx
// client
router.delete(`/posts/${id}/comments${window.location.hash}`);
```

```ts
// server: the redirect to /page lands on /page#comments
this.inertia.preserveFragment(res);
res.redirect(303, '/page');
```

---

# BigInt Values

Props can contain `BigInt` (e.g. `bigint` columns from Prisma or TypeORM). They are sent as `{ "$bigint": "<digits>" }` with `preserveBigIntegers: true`, and the v3 client turns them back into `BigInt`. Nothing to configure — a plain `JSON.stringify` would throw on them.

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

It is sent as the top-level `flash` field of the page object, so the client reads it via `usePage().flash.message` or the `router.on('flash', …)` event on the next page.

Everything flashed in one response is merged: calling `flash()` twice, or `flash()` plus a redirect back with validation errors, keeps all of it.

> `props.flash` is still populated for backwards compatibility but is deprecated and will be removed in 2.0 — it also ends up in saved history state, so going back re-shows old toasts.

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
| `defer(fn, group?, rescue?)` | Loaded asynchronously; with `rescue: true` a throwing `fn` is omitted and listed in `rescuedProps` instead of failing the request |
| `merge(fn, { prepend?, at?, matchOn? })` | Append (or prepend) new data to existing client data |
| `deepMerge(fn, { matchOn? })` | Deep-merge nested objects with existing client data |
| `defer(fn, { group?, rescue?, merge?, deepMerge? })` | Deferred, optionally merged into existing client data |
| `once(fn, { key?, expiresIn?, fresh? })` | Resolved once, then skipped while the client holds it |
| `scroll(fn, { metadata, wrapper?, defer? })` | Paginated data for `<InfiniteScroll>` |

---

# License

MIT
