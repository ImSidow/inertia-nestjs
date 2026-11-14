import { Injectable, NestMiddleware } from '@nestjs/common';
import {
    HttpRequestLike,
    HttpResponseLike,
    NextFunctionLike,
    inertiaHttpAdapter,
} from '../adapters';
import {
    INERTIA_HEADER,
    INERTIA_LOCATION_HEADER,
    INERTIA_VERSION_HEADER,
    INERTIA_REDIRECT_HEADER,
} from '../common/inertia.constants';
import { InertiaService } from '../services/inertia.service';

/**
 * HandleInertiaRequests middleware.
 *
 * The NestJS equivalent of `\Inertia\Middleware` in inertia-laravel.
 *
 * Responsibilities:
 *  - Detect Inertia requests via `X-Inertia` header
 *  - On asset version mismatch (GET + Inertia request), trigger a full reload
 *    by responding with 409 Conflict + `X-Inertia-Location` header
 *  - On non-GET Inertia request that receives a redirect (301/302),
 *    rewrite to a 303 See Other so the browser follows with GET
 *  - Share props that should be available on every Inertia page
 *
 * Usage:
 *   Apply globally in your AppModule:
 *
 *   ```ts
 *   export class AppModule implements NestModule {
 *     configure(consumer: MiddlewareConsumer) {
 *       consumer.apply(HandleInertiaRequests).forRoutes('*');
 *     }
 *   }
 *   ```
 *
 *   Or extend it to customise shared props:
 *
 *   ```ts
 *   @Injectable()
 *   export class HandleInertiaRequests extends InertiaMiddleware {
 *     async share(req: HttpRequestLike) {
 *       return {
 *         ...(await super.share(req)),
 *         auth: { user: req.user },
 *       };
 *     }
 *   }
 *   ```
 */
@Injectable()
export class HandleInertiaRequests implements NestMiddleware {
    constructor(protected readonly inertia: InertiaService) {}

    async use(
        req: HttpRequestLike,
        res: HttpResponseLike,
        next: NextFunctionLike,
    ): Promise<void> {
        const isInertiaRequest = !!inertiaHttpAdapter.getHeader(
            req,
            INERTIA_HEADER,
        );

        // Set up front so every response (HTML, JSON, 409, redirects) carries it,
        // like inertia-laravel's middleware.
        inertiaHttpAdapter.appendVary(res, 'X-Inertia');

        if (isInertiaRequest) {
            // Asset version check — trigger full reload on mismatch
            const clientVersion = inertiaHttpAdapter.getHeader(
                req,
                INERTIA_VERSION_HEADER,
            );
            const serverVersion = await this.inertia.getVersion();
            const method = inertiaHttpAdapter.getRequestMethod(req);

            if (
                // req.method === 'GET' &&
                method === 'GET' &&
                clientVersion !== undefined &&
                clientVersion !== serverVersion
            ) {
                await this.onVersionChange(req, res);
                return;
            }

            // Rewrite redirects as they're written. Patching the raw Node writeHead
            // catches every redirect path: Express res.redirect, Fastify
            // reply.redirect, @Redirect(), or a hand-set Location header.
            //  - A Location with a #fragment becomes 409 + X-Inertia-Redirect, so
            //    the client can visit it with the fragment intact (not for prefetches).
            //  - Otherwise 301/302 → 303 on non-GET requests, so the browser follows with GET.
            const nonGet = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
            const prefetch = inertiaHttpAdapter.getHeader(req, 'purpose') === 'prefetch';
            const raw = inertiaHttpAdapter.raw(res);
            const writeHead = raw.writeHead;
            if (typeof writeHead === 'function') {
                raw.writeHead = function (statusCode: number, ...rest: unknown[]) {
                    if (statusCode >= 300 && statusCode < 400 && !prefetch) {
                        // Fastify passes headers to writeHead; Express sets them first.
                        const passed = rest.find(
                            (arg): arg is Record<string, unknown> =>
                                !!arg && typeof arg === 'object' && !Array.isArray(arg),
                        );
                        const passedKey = passed && Object.keys(passed).find((k) => k.toLowerCase() === 'location');
                        const location = String((passedKey ? passed![passedKey] : this.getHeader('location')) ?? '');
                        if (location.includes('#')) {
                            if (passedKey) delete passed![passedKey];
                            this.removeHeader('location');
                            this.setHeader(INERTIA_REDIRECT_HEADER, location);
                            // Drop the 3xx status message ("Found") along with the code.
                            const args = rest.filter((arg) => typeof arg !== 'string');
                            return writeHead.call(this, 409, ...args);
                        }
                    }
                    const code = nonGet && (statusCode === 301 || statusCode === 302) ? 303 : statusCode;
                    return writeHead.call(this, code, ...rest);
                };
            }
        }

        // Read & clear flash cookie (set by inertia.redirectBack / inertia.flash).
        // cookie-parser gives a decoded value; without it, fall back to the raw header.
        const cookies = (req as any).cookies as
            | Record<string, string>
            | undefined;
        const flashRaw =
            cookies?.__inertia_flash ??
            readCookie(inertiaHttpAdapter.getHeader(req, 'cookie'), '__inertia_flash');
        if (flashRaw) {
            inertiaHttpAdapter.setCookie(res, '__inertia_flash', '', {
                maxAge: 0,
                path: '/',
            });
            const flash = parseFlash(flashRaw);
            if (flash) inertiaHttpAdapter.raw(req).__inertiaFlash = flash;
        }

        // Share request-level props (subclasses can override). Passed with
        const shared = await this.share(req);
        if (shared && typeof shared === 'object') {
            Object.entries(shared).forEach(([key, value]) => {
                this.inertia.share(key, value as never, req);
            });
        }

        next();
    }

    /**
     * Return shared props for every Inertia response.
     *
     * Override this in a subclass to inject per-request shared data.
     * Equivalent to `share()` in Laravel's HandleInertiaRequests middleware.
     *
     * @example
     * async share(req: HttpRequestLike) {
     *   return {
     *     auth: {
     *       user: req.user ? { id: req.user.id, name: req.user.name } : null,
     *     },
     *     flash: {
     *       message: (req.session as any)?.flash?.message,
     *     },
     *   };
     * }
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async share(_req: HttpRequestLike): Promise<Record<string, unknown>> {
        return {};
    }

    /**
     * Called when the client's asset version doesn't match the server's.
     *
     * By default, responds with 409 Conflict and the current URL as the
     * `X-Inertia-Location` header, causing the client to do a full page reload.
     *
     * Equivalent to `onVersionChange()` in Laravel's Middleware.
     */
    protected async onVersionChange(
        req: HttpRequestLike,
        res: HttpResponseLike,
    ): Promise<void> {
        inertiaHttpAdapter.setStatus(res, 409);
        inertiaHttpAdapter.setHeader(
            res,
            INERTIA_LOCATION_HEADER,
            inertiaHttpAdapter.getRequestUrl(req),
        );
        // Lets the v3 client skip the forced reload for background requests.
        inertiaHttpAdapter.setHeader(
            res,
            INERTIA_VERSION_HEADER,
            await this.inertia.getVersion(),
        );
        inertiaHttpAdapter.end(res);
    }
}

/** Raw (still URI-encoded) value of one cookie from a `Cookie` request header. */
function readCookie(header: string | undefined, name: string): string | undefined {
    for (const part of header?.split(';') ?? []) {
        const eq = part.indexOf('=');
        if (eq !== -1 && part.slice(0, eq).trim() === name) {
            return part.slice(eq + 1).trim();
        }
    }
    return undefined;
}

/**
 * Parse the flash payload, decoding at most once: cookie-parser hands over an
 * already-decoded value, and decoding it again breaks messages containing `%`.
 */
function parseFlash(raw: string): Record<string, unknown> | undefined {
    for (const candidate of [() => raw, () => decodeURIComponent(raw)]) {
        try {
            const value = JSON.parse(candidate());
            if (value && typeof value === 'object') return value;
        } catch {
            // try the next form; a malformed cookie is ignored
        }
    }
    return undefined;
}
