import { Inject, Injectable, Logger, Optional, Scope } from '@nestjs/common';
import {
    HttpRequestLike,
    HttpResponseLike,
    inertiaHttpAdapter,
} from '../adapters';
import {
    InertiaModuleOptions,
    InertiaPage,
    InertiaProps,
    MergeProp,
    PropValue,
    RenderOptions,
} from '../common/inertia.interfaces';
import {
    INERTIA_HEADER,
    INERTIA_LOCATION_HEADER,
    INERTIA_PARTIAL_COMPONENT_HEADER,
    INERTIA_PARTIAL_DATA_HEADER,
    INERTIA_PARTIAL_EXCEPT_HEADER,
    INERTIA_RESET_HEADER,
} from '../common/inertia.constants';
import { isAlways, isDefer, isLazy, isMerge } from '../common/inertia.props';
import { SSR_GATEWAY, SsrGateway } from '../ssr/ssr-gateway.interface';

/** True for object literals (`{}`), false for arrays, null, Date, and other class instances. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * Core Inertia service.
 *
 * Equivalent to the `Inertia` facade / `ResponseFactory` in inertia-laravel.
 * Handles building Inertia page responses, sharing props, and location redirects.
 */
@Injectable({ scope: Scope.DEFAULT })
export class InertiaService {
    private readonly logger = new Logger(InertiaService.name);
    private sharedProps: Record<string, PropValue> = {};
    private rootView: string;
    private version: string | (() => string | Promise<string>);
    private encryptHistory: boolean;

    constructor(
        private readonly options: InertiaModuleOptions,
        @Optional()
        @Inject(SSR_GATEWAY)
        private readonly ssrGateway?: SsrGateway,
    ) {
        this.rootView = options.rootView ?? 'app';
        this.version = options.version ?? '';
        this.encryptHistory = options.encryptHistory ?? false;

        if (options.sharedProps) {
            if (typeof options.sharedProps === 'function') {
                this.share('__factory__', options.sharedProps as PropValue);
            } else {
                Object.entries(options.sharedProps).forEach(([key, value]) => {
                    this.share(key, value as PropValue);
                });
            }
        }
    }

    share(key: string, value: PropValue, req?: HttpRequestLike): this {
        if (req) {
            const target = (req as any).__inertiaShared ?? {};
            target[key] = value;
            (req as any).__inertiaShared = target;
            return this;
        }

        this.sharedProps[key] = value;
        return this;
    }

    getShared(
        key?: string,
        req?: HttpRequestLike,
    ): Record<string, PropValue> | PropValue | undefined {
        const requestShared = (req && (req as any).__inertiaShared) || {};
        const combined = { ...this.sharedProps, ...requestShared };

        if (!key) return combined;
        return combined[key];
    }

    flushShared(): this {
        this.sharedProps = {};
        return this;
    }

    setVersion(version: string | (() => string | Promise<string>)): this {
        this.version = version;
        return this;
    }

    async getVersion(): Promise<string> {
        if (typeof this.version === 'function') {
            return String(await this.version());
        }

        return String(this.version ?? '');
    }

    setRootView(rootView: string): this {
        this.rootView = rootView;
        return this;
    }

    getRootView(): string {
        return this.rootView;
    }

    async buildPage<TRequest extends HttpRequestLike = HttpRequestLike>(
        req: TRequest,
        component: string,
        options: RenderOptions = {},
    ): Promise<InertiaPage> {
        const { props = {}, encryptHistory, clearHistory, url } = options;

        const isInertiaRequest = !!inertiaHttpAdapter.getHeader(
            req,
            INERTIA_HEADER,
        );
        const partialComponent = inertiaHttpAdapter.getHeader(
            req,
            INERTIA_PARTIAL_COMPONENT_HEADER,
        );
        const isPartial = isInertiaRequest && partialComponent === component;

        const flash: { errors?: Record<string, unknown>; flash?: Record<string, unknown> } =
            (req as any).__inertiaFlash ?? {};
        const requestShared: Record<string, PropValue> =
            (req as any).__inertiaShared ?? {};
        const { __factory__: factory, ...staticShared } = this.sharedProps;
        const factoryShared: Record<string, PropValue> =
            typeof factory === 'function'
                ? ((await (factory as () => unknown)()) as Record<string, PropValue>) ?? {}
                : {};
        const shared = { ...factoryShared, ...staticShared, ...requestShared };
        const combinedProps = {
            errors: {},
            ...shared,
            ...(flash.errors ? { errors: flash.errors } : {}),
            // Deprecated: v3 clients read flash from the top-level `page.flash`.
            // Kept in props so 1.x apps reading `props.flash` don't break; drop in 2.0.
            ...(flash.flash ? { flash: flash.flash } : {}),
            ...props,
        };

        const ctx: ResolveContext = {
            isPartial,
            only: isPartial ? this.parseListHeader(req, INERTIA_PARTIAL_DATA_HEADER) : [],
            except: isPartial ? this.parseListHeader(req, INERTIA_PARTIAL_EXCEPT_HEADER) : [],
            reset: this.parseListHeader(req, INERTIA_RESET_HEADER),
            deferredProps: {},
            mergeProps: [],
            prependProps: [],
            deepMergeProps: [],
            matchPropsOn: [],
            rescuedProps: [],
        };
        const resolvedProps = await this.resolveProps(combinedProps, ctx);

        const currentVersion = await this.getVersion();
        // `errors` is always shared, matching inertia-laravel's default middleware.
        const sharedProps = [...new Set(['errors', ...Object.keys(shared)])];
        const { deferredProps, mergeProps, prependProps, deepMergeProps, matchPropsOn, rescuedProps } = ctx;

        return {
            component,
            props: resolvedProps,
            url: url ?? inertiaHttpAdapter.getRequestUrl(req),
            version: currentVersion,
            ...(encryptHistory !== undefined
                ? { encryptHistory }
                : this.encryptHistory
                  ? { encryptHistory: true }
                  : {}),
            ...(clearHistory ? { clearHistory: true } : {}),
            sharedProps,
            ...(Object.keys(deferredProps).length ? { deferredProps } : {}),
            ...(mergeProps.length ? { mergeProps } : {}),
            ...(prependProps.length ? { prependProps } : {}),
            ...(deepMergeProps.length ? { deepMergeProps } : {}),
            ...(matchPropsOn.length ? { matchPropsOn } : {}),
            ...(rescuedProps.length ? { rescuedProps } : {}),
            ...(flash.flash ? { flash: flash.flash } : {}),
        };
    }

    async respond<
        TRequest extends HttpRequestLike = HttpRequestLike,
        TResponse extends HttpResponseLike = HttpResponseLike,
    >(
        req: TRequest,
        res: TResponse,
        page: InertiaPage,
        options: RenderOptions = {},
    ): Promise<void> {
        const isInertiaRequest = !!inertiaHttpAdapter.getHeader(
            req,
            INERTIA_HEADER,
        );

        if (isInertiaRequest) {
            inertiaHttpAdapter.setStatus(res, options.status ?? 200);
            inertiaHttpAdapter.setHeader(
                res,
                'Content-Type',
                'application/json',
            );
            // Append rather than overwrite, so other middleware's Vary values survive.
            const vary = inertiaHttpAdapter.getHeaderFromResponse(res, 'Vary');
            const varies = vary?.split(',').map((v) => v.trim().toLowerCase()) ?? [];
            inertiaHttpAdapter.setHeader(
                res,
                'Vary',
                !vary ? 'X-Inertia' : varies.includes('x-inertia') || varies.includes('*') ? vary : `${vary}, X-Inertia`,
            );
            inertiaHttpAdapter.setHeader(res, INERTIA_HEADER, 'true');
            inertiaHttpAdapter.json(res, page);
            return;
        }

        const ssrResponse =
            this.ssrGateway && options.ssr !== false
                ? await this.ssrGateway.dispatch(page)
                : null;

        await inertiaHttpAdapter.renderAsync(res, this.rootView, {
            page,
            ssrHead: ssrResponse?.head ?? [],
            ssrBody: ssrResponse?.body ?? null,
        });
    }

    async render<
        TRequest extends HttpRequestLike = HttpRequestLike,
        TResponse extends HttpResponseLike = HttpResponseLike,
    >(
        req: TRequest,
        res: TResponse,
        component: string,
        options: RenderOptions = {},
    ): Promise<void> {
        const responseState = res as TResponse & {
            headersSent?: boolean;
            __inertiaHandled?: boolean;
        };

        if (responseState.headersSent || responseState.__inertiaHandled) {
            return;
        }

        responseState.__inertiaHandled = true;

        const page = await this.buildPage(req, component, options);

        await this.respond(req, res, page, options);
    }

    redirectBack<
        TRequest extends HttpRequestLike = HttpRequestLike,
        TResponse extends HttpResponseLike = HttpResponseLike,
    >(
        req: TRequest,
        res: TResponse,
        errors?: Record<string, string>,
        path?: string,
    ): void {
        const referer =
            path ?? inertiaHttpAdapter.getHeader(req, 'referer') ?? '/';
        if (errors) {
            inertiaHttpAdapter.setCookie(
                res,
                '__inertia_flash',
                JSON.stringify({ errors }),
                {
                    httpOnly: true,
                    sameSite: 'lax',
                    maxAge: 10_000,
                    path: '/',
                },
            );
        }
        inertiaHttpAdapter.redirect(res, 303, referer);
    }

    /**
     * Flash arbitrary one-off data (e.g. a success toast) to be read on the
     * next request via `props.flash`. Unlike `share()`, this data does not
     * persist beyond the next response. Does not redirect — call this before
     * issuing your own redirect.
     */
    flash<TResponse extends HttpResponseLike = HttpResponseLike>(
        res: TResponse,
        data: Record<string, unknown>,
    ): void {
        inertiaHttpAdapter.setCookie(
            res,
            '__inertia_flash',
            JSON.stringify({ flash: data }),
            {
                httpOnly: true,
                sameSite: 'lax',
                maxAge: 10_000,
                path: '/',
            },
        );
    }

    location<
        TRequest extends HttpRequestLike = HttpRequestLike,
        TResponse extends HttpResponseLike = HttpResponseLike,
    >(req: TRequest, res: TResponse, url: string): void {
        const isInertiaRequest = !!inertiaHttpAdapter.getHeader(
            req,
            INERTIA_HEADER,
        );

        if (isInertiaRequest) {
            inertiaHttpAdapter.setStatus(res, 409);
            inertiaHttpAdapter.setHeader(res, INERTIA_LOCATION_HEADER, url);
            inertiaHttpAdapter.end(res);
        } else {
            inertiaHttpAdapter.redirect(res, 302, url);
        }
    }

    private parseListHeader(req: HttpRequestLike, name: string): string[] {
        const header = inertiaHttpAdapter.getHeader(req, name);
        return header
            ? header
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
            : [];
    }

    /**
     * Resolve the prop tree, collecting page metadata into `ctx` along the way.
     * Paths are dot-notated (`auth.user`) so nested prop types and nested
     * partial reloads work the same way they do in inertia-laravel.
     */
    private async resolveProps(
        props: Record<string, PropValue>,
        ctx: ResolveContext,
        prefix = '',
    ): Promise<InertiaProps> {
        const resolved: InertiaProps = {};

        for (const [key, value] of Object.entries(props)) {
            const path = prefix ? `${prefix}.${key}` : key;

            if (isAlways(value)) {
                // Always props bypass only/except entirely -- that's the point of
                // "always" (matches inertia-laravel's AlwaysProp).
                resolved[key] = await value.fn();
                continue;
            }

            if (ctx.isPartial && !partialIncludes(path, ctx)) continue;

            if (isDefer(value)) {
                if (!ctx.isPartial) {
                    (ctx.deferredProps[value.group ?? 'default'] ??= []).push(path);
                    continue;
                }
                try {
                    resolved[key] = await value.fn();
                } catch (err) {
                    if (!value.rescue) throw err;
                    this.logger.error(
                        `Deferred prop "${path}" threw and was rescued`,
                        err instanceof Error ? err.stack : String(err),
                    );
                    // Matches inertia-laravel: omit the prop and list it in
                    // `rescuedProps` so the client's <Deferred> rescue slot renders.
                    ctx.rescuedProps.push(path);
                }
                continue;
            }

            if (isMerge(value)) {
                collectMergeMetadata(path, value, ctx);
                resolved[key] = await value.fn();
                continue;
            }

            if (isLazy(value)) {
                if (!ctx.isPartial) continue;
                resolved[key] = await value();
                continue;
            }

            if (isPlainObject(value)) {
                resolved[key] = await this.resolveProps(
                    value as Record<string, PropValue>,
                    ctx,
                    path,
                );
                continue;
            }

            resolved[key] = value;
        }

        return resolved;
    }
}

interface ResolveContext {
    isPartial: boolean;
    only: string[];
    except: string[];
    reset: string[];
    deferredProps: Record<string, string[]>;
    mergeProps: string[];
    prependProps: string[];
    deepMergeProps: string[];
    matchPropsOn: string[];
    rescuedProps: string[];
}

function isSameOrUnder(path: string, parent: string): boolean {
    return path === parent || path.startsWith(`${parent}.`);
}

function matchesOnly(path: string, ctx: ResolveContext): boolean {
    return !ctx.only.length || ctx.only.some((o) => isSameOrUnder(path, o));
}

function matchesExcept(path: string, ctx: ResolveContext): boolean {
    return ctx.except.some((e) => isSameOrUnder(path, e));
}

/** Keep a path if it is, is inside, or leads to an `only` path, and isn't excepted. */
function partialIncludes(path: string, ctx: ResolveContext): boolean {
    const leadsToOnly = ctx.only.some((o) => o.startsWith(`${path}.`));
    return (matchesOnly(path, ctx) || leadsToOnly) && !matchesExcept(path, ctx);
}

function collectMergeMetadata(
    path: string,
    prop: MergeProp,
    ctx: ResolveContext,
): void {
    if (ctx.reset.includes(path)) return;
    // A parent merely leading to an `only` path doesn't opt it into merging.
    if (ctx.isPartial && (!matchesOnly(path, ctx) || matchesExcept(path, ctx))) {
        return;
    }

    if (prop.mode === 'deep') {
        ctx.deepMergeProps.push(path);
    } else {
        const target = prop.mode === 'prepend' ? ctx.prependProps : ctx.mergeProps;
        target.push(prop.at ? `${path}.${prop.at}` : path);
    }

    for (const field of prop.matchOn ?? []) {
        ctx.matchPropsOn.push(`${path}.${field}`);
    }
}
