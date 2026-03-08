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

            // Intercept response to convert 301/302 → 303 on non-GET Inertia requests
            if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
                const originalRedirect =
                    typeof res.redirect === 'function'
                        ? res.redirect.bind(res)
                        : undefined;

                if (originalRedirect) {
                    (res.redirect as unknown) = (
                        urlOrStatus: string | number,
                        url?: string,
                    ) => {
                        let status: number;
                        let location: string;

                        if (typeof urlOrStatus === 'string') {
                            status = 302;
                            location = urlOrStatus;
                        } else {
                            status = urlOrStatus;
                            location = url!;
                        }

                        if (status === 301 || status === 302) {
                            status = 303;
                        }

                        return originalRedirect(status, location);
                    };
                }
            }
        }

        // Share request-level props (subclasses can override)
        const shared = await this.share(req);
        if (shared && typeof shared === 'object') {
            Object.entries(shared).forEach(([key, value]) => {
                this.inertia.share(key, value as never);
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
        inertiaHttpAdapter.end(res);
    }
}
