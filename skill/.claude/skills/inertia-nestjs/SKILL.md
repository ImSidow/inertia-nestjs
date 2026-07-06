---
name: inertia-nestjs
description: NestJS + Inertia.js adapter usage. Use when wiring InertiaModule, rendering pages with @Inertia, handling validation errors or exceptions, setting up SSR, testing Inertia responses, or scaffolding a new React frontend.
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
        bundlePath: 'bootstrap/ssr/ssr.js',
        timeout: 5000, // ms before falling back to CSR
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
import { lazy, always, defer, merge } from 'inertia-nestjs';

return {
  users: lazy(() => this.usersService.findAll()), // only on partial reloads that request it
  auth: always(() => this.getAuthUser()),          // every request, even partial reloads
  stats: defer(() => this.computeStats()),          // separate async request after initial load
  stats2: defer(() => this.computeStats2(), 'group'), // deferred props with the same group load together
  notifications: merge(() => this.getNew()),         // client merges instead of replacing
};
```

## Validation

```typescript
import { InertiaValidate } from 'inertia-nestjs';

@Post('/users')
@InertiaValidate() // or @InertiaValidate('Users/Create') to redirect to a specific component
create(@Body() dto: CreateUserDto) {
  // class-validator throws -> InertiaValidationFilter catches it, flashes errors,
  // redirects back (302) with the errors in the next page's props.errors
}
```

Client reads `usePage().props.errors` (or `useForm`'s `errors`) after the redirect.

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

Flashes the exception's message as an error and redirects back (or to `returnPath` if given), same mechanism as validation errors — `@InertiaValidate` and `@InertiaHandleException` share the underlying interceptor/filter.

## SSR

When `ssr` is set in `forRoot()`, `InertiaService` calls the configured `HttpGateway` to render on the Node SSR server; on any failure (connection refused, non-200, bad payload) it logs a warning and falls back to client-side rendering — SSR failures never 500 the request. `SSR_GATEWAY`/`SsrGateway` are exported if you need a custom gateway implementation instead of the default HTTP one.

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
npx inertia-nestjs react
```

Copies `resources/js/{app.tsx,ssr.tsx,pages/,tsconfig.json,vite-env.d.ts}`, `resources/css/app.css`, `views/app.hbs`, and `vite.config.mts` into the current project; auto-patches `tsconfig.build.json` (excludes `resources`/`vite.config.mts`), the root `tsconfig.json` (`@/*` alias), and `package.json` scripts; auto-installs `@inertiajs/react`, `@inertiajs/vite`, `react`, `react-dom`, `vite`, `@vitejs/plugin-react` via the detected package manager (falls back to printing the manual commands if the install fails). Then prompts (in a real terminal only — auto-declines in CI/non-TTY) to auto-wire `src/main.ts` (Handlebars view engine + static assets) and `src/app.module.ts` (`InertiaModule.forRoot()` registration), but only when those files still match the untouched `nest new` scaffold — otherwise it prints the snippet instead of guessing an edit.

Re-running the command is safe — every file/patch step skips whatever already exists.

## Known Gotchas

- **`hbs` needs `@types/hbs` too.** Installing just `hbs` produces `Could not find a declaration file for module 'hbs'` under `strict` TypeScript. Install both, matching versions.
- **`tsconfig.build.json`'s `exclude` overrides, not merges with, the base `tsconfig.json`'s.** If your frontend files (`resources/`, `vite.config.mts`) are only excluded in the base config, `nest build`/`nest start` will still try to type-check them and fail with `import.meta`/JSX errors.
- **`vite.config.mts`, not `.ts`.** `@inertiajs/vite` is ESM-only; a plain `.ts` config gets loaded as CommonJS in a project without `"type": "module"`, and `require()` on an ESM-only package fails. `.mts` forces ESM regardless of the project's module type.
- **`app.useStaticAssets(join(process.cwd(), 'public'))` is required**, not optional, alongside `setBaseViewsDir`/`setViewEngine` — without it the built client bundle 404s and the page never hydrates, even though the server-rendered HTML (and the `data-page` JSON payload) looks completely correct.
- **Non-GET requests get the URL from the `Referer` header**, not the request path — so Inertia page responses after a form POST carry the *form's* URL, not the POST endpoint's.
- **UI-library CLIs (e.g. shadcn) read the *root* `tsconfig.json` for path aliases**, not a nested one. If you colocate a `resources/js/tsconfig.json` with its own `@/*` alias, also add the same alias to the root `tsconfig.json` if you want those tools to auto-detect it.
