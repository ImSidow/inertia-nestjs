---
name: inertia-nestjs
description: NestJS + Inertia.js adapter usage. Use when wiring InertiaModule, rendering pages with @Inertia, handling validation errors or exceptions, setting up SSR, testing Inertia responses, or scaffolding a new React or Vue frontend.
---

# inertia-nestjs

Platform-agnostic NestJS adapter for Inertia.js (Express and Fastify).

## Module Setup

```typescript
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HandleInertiaRequests, InertiaModule } from 'inertia-nestjs';

@Module({
  imports: [
    InertiaModule.forRoot({
      rootView: 'app', // template name your view engine renders, gets a `page` variable
      version: '1.0.0', // string or () => string | Promise<string>; mismatch triggers full reload
      sharedProps: {}, // or a (async) factory — merged into every response
      encryptHistory: false,
      ssr: {
        enabled: true,
        url: 'http://127.0.0.1:13714', // SSR server; /render is appended automatically
        // bundlePath: omit it — bootstrap/ssr/ssr.mjs (scaffold output) and ssr.js are found automatically; a wrong path silently disables SSR
        timeout: 5000, // ms before falling back to CSR
        exclude: ['/admin/*'], // glob patterns to skip SSR for (falls back to CSR); '/admin' matches only that exact path, '/admin/*' matches everything under it
      },
    }),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HandleInertiaRequests).forRoutes('*');
  }
}
```

`forRootAsync({ imports, useFactory, inject })` is available for config-driven setup.

`forRoot()`/`forRootAsync()` auto-register everything else in this doc — the validation filter, the exception interceptor, and the middleware. You never wire those manually.

## Rendering Pages

```typescript
import { Inertia } from 'inertia-nestjs';

@Get('/users')
@Inertia('Users/Index')
index() {
  return { users: [] }; // becomes props
}

// Options (everything but `props`, which is the return value):
@Get('/dashboard')
@Inertia('Dashboard', { encryptHistory: true, status: 201, url: '/dashboard' })
dashboard() {
  return { stats: [] };
}
```

The handler's return value is the props object. `url` defaults to `req.originalUrl`; `status` defaults to 200.

## Prop Helpers

```typescript
import { lazy, always, defer, merge, deepMerge, once, scroll } from 'inertia-nestjs';

return {
  users: lazy(() => this.usersService.findAll()), // only on partial reloads that request it
  auth: always(() => this.getAuthUser()),          // every request, even partial reloads
  stats: defer(() => this.computeStats()),          // separate async request after initial load
  stats2: defer(() => this.computeStats2(), 'group'), // deferred props with the same group load together
  stats3: defer(() => this.riskyCompute(), 'group', true), // rescue: true -> if the callback throws, the prop is omitted and listed in page.rescuedProps instead of failing the request
  notifications: merge(() => this.getNew()),         // client merges instead of replacing
  // merge(fn, { matchOn: 'id' | at: 'data' | prepend: true }), deepMerge(fn) for nested objects.
  // defer(fn, { group, rescue, merge, deepMerge }) — deferred + merged ("load more").
  permissions: once(() => this.getPermissions(user), { key: `permissions:${user?.id ?? 'guest'}`, expiresIn: 3_600_000 }), // best as a SHARED prop: the client only skips once props present on the page it is leaving; per-user key or a guest's value sticks after sign-in
  posts: scroll(() => this.paginate(page), { metadata: (p) => ({ pageName: 'page', currentPage: p.page, previousPage: p.prev, nextPage: p.next }) }), // <InfiniteScroll>
  // BigInt values are encoded automatically; redirects to /x#frag keep the fragment.
  // Helpers work at any depth; partial reloads accept dot paths (only: ['auth.permissions']).
};
```

## Sharing Props

Data needed on **every** page (auth user, flash messages) — don't repeat this per-controller.

**Static/global data** — via `forRoot()`:
```typescript
InertiaModule.forRoot({
  sharedProps: { appName: 'My App' },
});
```

**Per-request data** (auth user, session flash) — extend `HandleInertiaRequests`, override `share()`:
```typescript
import { Injectable } from '@nestjs/common';
import { HandleInertiaRequests, InertiaService } from 'inertia-nestjs';
import { Request } from 'express';

@Injectable()
export class InertiaShareMiddleware extends HandleInertiaRequests {
  constructor(inertia: InertiaService) {
    super(inertia);
  }

  async share(req: Request) {
    const user = req.user as { id: string; name: string; email: string } | undefined;

    return {
      ...(await super.share(req)),
      auth: { user: user ? { id: user.id, name: user.name, email: user.email } : null },
    };
  }
}
```
Register it in place of the base middleware: `consumer.apply(InertiaShareMiddleware).forRoutes('*')`.

**Security: never spread the raw user entity** (`auth: { user: req.user }`). Shared props get serialized straight into the `<script type="application/json" data-page="app">` tag in the page's HTML — anyone can view-source it. If `req.user` is a Passport/ORM entity, spreading it verbatim leaks the password hash (and any other sensitive column) to the client. Always pick specific fields (`id`, `name`, `email`) explicitly.

**`InertiaService.share(key, value, req)`** — pass `req` when calling this directly in a controller/service. `InertiaService` is a singleton; without `req`, the value is written globally onto the singleton's own state and can leak into other concurrent requests' responses. The middleware pattern above already passes `req` for you — this only matters if you call `.share()` yourself outside of a `HandleInertiaRequests` subclass.

**Gotcha — middleware runs before guards.** `HandleInertiaRequests` is Nest middleware, which always executes before guards in Nest's request pipeline. If your auth sets `req.user` via a Guard (not earlier middleware), it won't be populated yet when `share(req)` runs above. Either populate `req.user` via middleware instead of a guard, or have your `share()` override call your auth library's session lookup directly (e.g. `auth.api.getSession()`) instead of reading `req.user`.

## Validation

```typescript
// main.ts — required for per-field errors (Nest's default ValidationPipe drops the field names)
import { InertiaValidationPipe } from 'inertia-nestjs';
app.useGlobalPipes(new InertiaValidationPipe({ whitelist: true }));
// own pipe setup? new ValidationPipe({ exceptionFactory: inertiaExceptionFactory })

import { InertiaValidate } from 'inertia-nestjs';

@Post('/users')
@InertiaValidate() // or @InertiaValidate('Users/Create') to redirect to a specific component
@Redirect('/users', 302) // optional success target; without it, success redirects back (303)
create(@Body() dto: CreateUserDto) {
  // invalid -> InertiaValidationFilter flashes { field: message } and redirects back (303)
}
```

Client reads `usePage().props.errors` (or `useForm`'s `errors`) after the redirect; nested DTO fields use dot paths (`'address.city'`). On success, `@Redirect()` (or a returned `{ url }`), an `@Inertia()` page, or a response the handler sent itself wins over "redirect back".

## Flash Data

```typescript
this.inertia.flash(res, { message: 'Saved!' }); // one-off data for the next request only
res.redirect(303, '/users');
```

Sent as the top-level `page.flash` field — client reads `usePage().flash.message` (or `router.on('flash', …)`) on the next page. `props.flash` is also populated but deprecated. Separate from validation `errors`, but both travel in the same `__inertia_flash` cookie and everything flashed in one response is merged — `flash()` twice, or `flash()` plus a redirect back with errors, keeps all of it. `this.inertia.preserveFragment(res)` before a redirect keeps the fragment of the URL the client *requested* — browsers never send fragments, so the client must request e.g. `` `/posts/1/comments${window.location.hash}` ``.

## Exception Handling

```typescript
import { InertiaHandleException } from 'inertia-nestjs';

@Post('/orders')
@InertiaHandleException() // catches all HTTP exceptions thrown in this handler
create() { ... }

@Post('/orders/:id')
@InertiaHandleException({ codes: [404, 409], returnPath: '/orders' })
update() { ... }
```

Flashes the exception's message as an error and redirects back (or to `returnPath` if given), same mechanism as validation errors — `@InertiaValidate` and `@InertiaHandleException` share the underlying interceptor/filter. Both work on a controller class too (method-level wins) — e.g. `@UseGuards(AuthGuard) @InertiaHandleException({ codes: [401], returnPath: '/login' })` on the class sends signed-out users to /login from every route. Plain browser requests (bookmarks, new tabs) are redirected the same way; only `Accept: application/json`-only clients get the JSON error. "Redirect back" ignores a `Referer` from another site (goes to `/`).

**Error pages:** unhandled errors (unknown route, crash) otherwise reach the client as JSON shown raw in its error dialog. Render your own page with the right status:

```typescript
InertiaModule.forRoot({
  handleExceptionsUsing: (error) => {
    if ([403, 404, 500, 503].includes(error.statusCode)) return error.render('error', { status: error.statusCode });
    // nothing returned -> default response
  },
});
```

Works for Inertia visits and first (HTML) visits; shared props are included; JSON-only clients keep JSON; a throwing callback falls back to the default. Never put `error.exception`'s message into props.

## SSR

When `ssr` is set in `forRoot()`, `InertiaService` calls the configured `HttpGateway` to render on the Node SSR server; on any failure (connection refused, non-200, bad payload) it logs a warning and falls back to client-side rendering — SSR failures never 500 the request. `ssr.exclude` (glob patterns against the page URL) skips SSR for matching routes the same way — e.g. SSR a public landing page but not an auth-gated admin dashboard. For a single route that doesn't fit a URL pattern, `@Inertia(component, { ssr: false })` skips SSR for just that route, regardless of `ssr.exclude` — there's no equivalent `ssr: true` override to force SSR on a route `exclude` already matched. `SSR_GATEWAY`/`SsrGateway` are exported if you need a custom gateway implementation instead of the default HTTP one.

## Testing

```typescript
import { assertInertia, assertInertiaLocation } from 'inertia-nestjs';

const res = await request(app.getHttpServer()).get('/users').set('X-Inertia', 'true');
assertInertia(res.body, (page) => {
  page.component('Users/Index').has('users');
});

// For a 409 Inertia location response (external redirect):
assertInertiaLocation(res.headers, 'https://example.com');
```

`assertInertia` throws immediately if the body isn't a valid Inertia page or is missing `component` — usually means the test request forgot the `X-Inertia` header.

## Scaffolding a New Frontend

```bash
npx inertia-nestjs react   # or: npx inertia-nestjs vue
```

Copies `resources/js/{app,ssr}.{tsx|ts}` (React: `.tsx`, Vue: `.ts`), `resources/js/{pages/,tsconfig.json,vite-env.d.ts}`, `resources/css/app.css`, `views/app.hbs`, and `vite.config.mts` into the current project; auto-patches `tsconfig.build.json` (excludes `resources`/`vite.config.mts`), the root `tsconfig.json` (`@/*` alias), `package.json` scripts (the SSR bundle builds to `bootstrap/ssr/ssr.mjs`), and `.gitignore` (adds `/bootstrap` and `/public/build` — Vite's SSR/client build output, not source). A tsconfig with comments is left untouched and the exact lines to add are printed. Auto-installs the framework's packages via the detected package manager — React: `@inertiajs/react`, `@inertiajs/vite`, `react`, `react-dom`, `vite`, `@vitejs/plugin-react`; Vue: `@inertiajs/vue3`, `@inertiajs/vite`, `vue`, `vite`, `@vitejs/plugin-vue`, `vue-tsc` (falls back to printing the manual commands if the install fails). Vue pages are `.vue` single-file components under `resources/js/pages/`; type-check them with `vue-tsc --noEmit -p resources/js/tsconfig.json`. Then prompts (in a real terminal only — auto-declines in CI/non-TTY) to auto-wire `src/main.ts` (Handlebars view engine + static assets) and `src/app.module.ts` (`InertiaModule.forRoot()` registration), but only when those files still match the untouched `nest new` scaffold — otherwise it prints the snippet instead of guessing an edit.

Re-running the command is safe — every file/patch step skips whatever already exists.

## Known Gotchas

- **`hbs` needs `@types/hbs` too.** Installing just `hbs` produces `Could not find a declaration file for module 'hbs'` under `strict` TypeScript. Install both, matching versions.
- **`tsconfig.build.json`'s `exclude` overrides, not merges with, the base `tsconfig.json`'s.** If your frontend files (`resources/`, `vite.config.mts`) are only excluded in the base config, `nest build`/`nest start` will still try to type-check them and fail with `import.meta`/JSX errors.
- **`vite.config.mts`, not `.ts`.** `@inertiajs/vite` is ESM-only; a plain `.ts` config gets loaded as CommonJS in a project without `"type": "module"`, and `require()` on an ESM-only package fails. `.mts` forces ESM regardless of the project's module type.
- **`app.useStaticAssets(join(process.cwd(), 'public'))` is required**, not optional, alongside `setBaseViewsDir`/`setViewEngine` — without it the built client bundle 404s and the page never hydrates, even though the server-rendered HTML (and the `data-page` JSON payload) looks completely correct.
- **Non-GET requests get the URL from the `Referer` header**, not the request path — so Inertia page responses after a form POST carry the *form's* URL, not the POST endpoint's.
- **UI-library CLIs (e.g. shadcn) read the *root* `tsconfig.json` for path aliases**, not a nested one. If you colocate a `resources/js/tsconfig.json` with its own `@/*` alias, also add the same alias to the root `tsconfig.json` if you want those tools to auto-detect it.
