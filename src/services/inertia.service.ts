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
    MergeStrategy,
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
    INERTIA_EXCEPT_ONCE_PROPS_HEADER,
    INERTIA_INFINITE_SCROLL_MERGE_INTENT_HEADER,
} from '../common/inertia.constants';
import {
    always,
    isAlways,
    isDefer,
    isLazy,
    isMerge,
    isOnce,
    isScroll,
} from '../common/inertia.props';
import { SSR_GATEWAY, SsrGateway } from '../ssr/ssr-gateway.interface';
import { InertiaExceptionResponse } from '../common/inertia-exception-response';

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
            const state = inertiaHttpAdapter.raw(req);
            state.__inertiaShared = { ...state.__inertiaShared, [key]: value };
            return this;
        }

        this.sharedProps[key] = value;
        return this;
    }

    getShared(
        key?: string,
        req?: HttpRequestLike,
    ): Record<string, PropValue> | PropValue | undefined {
        const requestShared = (req && inertiaHttpAdapter.raw(req).__inertiaShared) || {};
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

        const state = inertiaHttpAdapter.raw(req);
        const flash: {
            errors?: Record<string, unknown>;
            flash?: Record<string, unknown>;
            preserveFragment?: boolean;
        } =
            state.__inertiaFlash ?? {};
        const requestShared: Record<string, PropValue> = state.__inertiaShared ?? {};
        const { __factory__: factory, ...staticShared } = this.sharedProps;
        const factoryShared: Record<string, PropValue> =
            typeof factory === 'function'
                ? ((await (factory as () => unknown)()) as Record<string, PropValue>) ?? {}
                : {};
        const shared = { ...factoryShared, ...staticShared, ...requestShared };
        const combinedProps: Record<string, PropValue> = {
            errors: {},
            ...shared,
            ...(flash.errors ? { errors: flash.errors } : {}),
            // Deprecated: v3 clients read flash from the top-level `page.flash`.
            // Kept in props so 1.x apps reading `props.flash` don't break; drop in 2.0.
            ...(flash.flash ? { flash: flash.flash } : {}),
            ...props,
        };
        // Errors come back on every response, partial reloads included, so the
        // client can clear stale ones (inertia-laravel shares them as Inertia::always()).
        const { errors } = combinedProps;
        if (![isAlways, isDefer, isMerge, isLazy, isOnce, isScroll].some((is) => is(errors))) {
            combinedProps.errors = always(() => errors);
        }

        const ctx: ResolveContext = {
            isPartial,
            isInertia: isInertiaRequest,
            only: isPartial ? this.parseListHeader(req, INERTIA_PARTIAL_DATA_HEADER) : [],
            except: isPartial ? this.parseListHeader(req, INERTIA_PARTIAL_EXCEPT_HEADER) : [],
            reset: this.parseListHeader(req, INERTIA_RESET_HEADER),
            loadedOnce: this.parseListHeader(req, INERTIA_EXCEPT_ONCE_PROPS_HEADER),
            scrollIntent: inertiaHttpAdapter.getHeader(req, INERTIA_INFINITE_SCROLL_MERGE_INTENT_HEADER),
            onceProps: {},
            scrollProps: {},
            deferredProps: {},
            mergeProps: [],
            prependProps: [],
            deepMergeProps: [],
            matchPropsOn: [],
            rescuedProps: [],
        };
        // JSON.stringify throws on BigInt (e.g. Prisma/TypeORM bigint columns), so
        // encode them as markers the v3 client turns back into BigInt.
        const encoded = encodeBigInts(await this.resolveProps(combinedProps, ctx));
        const resolvedProps = encoded.value as InertiaProps;

        const currentVersion = await this.getVersion();
        // `errors` is always shared, matching inertia-laravel's default middleware.
        const sharedProps = [...new Set(['errors', ...Object.keys(shared)])];
        const {
            deferredProps,
            mergeProps,
            prependProps,
            deepMergeProps,
            matchPropsOn,
            rescuedProps,
            onceProps,
            scrollProps,
        } = ctx;

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
            ...(Object.keys(onceProps).length ? { onceProps } : {}),
            ...(Object.keys(scrollProps).length ? { scrollProps } : {}),
            ...(encoded.found ? { preserveBigIntegers: true } : {}),
            ...(flash.preserveFragment ? { preserveFragment: true } : {}),
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

        // HTML and JSON share a URL, so caches must key on X-Inertia for both.
        inertiaHttpAdapter.appendVary(res, 'X-Inertia');

        if (isInertiaRequest) {
            inertiaHttpAdapter.setStatus(res, options.status ?? 200);
            inertiaHttpAdapter.setHeader(
                res,
                'Content-Type',
                'application/json',
            );
            inertiaHttpAdapter.setHeader(res, INERTIA_HEADER, 'true');
            inertiaHttpAdapter.json(res, page);
            return;
        }

        const ssrResponse =
            this.ssrGateway && options.ssr !== false
                ? await this.ssrGateway.dispatch(page)
                : null;

        // The first visit is HTML: it needs the status too (404/500 error pages, 422 re-renders).
        if (options.status !== undefined) inertiaHttpAdapter.setStatus(res, options.status);

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
        // Fastify's reply has no headersSent; its raw Node response does.
        const responseState = inertiaHttpAdapter.raw(res);

        if (responseState.headersSent || responseState.__inertiaHandled) {
            return;
        }

        responseState.__inertiaHandled = true;

        const page = await this.buildPage(req, component, options);

        await this.respond(req, res, page, options);
    }

    /**
     * Answer an unhandled error with the app's error page, if `handleExceptionsUsing`
     * renders one. Returns false to fall back to the default response; any failure
     * here (including the callback throwing) is logged and falls back too, so an
     * error page can never turn one error into two.
     *
     * Builds and sends the page directly rather than via render(): the error may
     * have happened mid-render, after the response was marked as rendered.
     */
    async renderException(
        req: HttpRequestLike,
        res: HttpResponseLike,
        exception: unknown,
        statusCode: number,
    ): Promise<boolean> {
        const handler = this.options.handleExceptionsUsing;
        if (!handler) return false;
        try {
            const result = await handler(new InertiaExceptionResponse(exception, req, res, statusCode));
            if (!(result instanceof InertiaExceptionResponse) || !result.page) return false;
            const page = await this.buildPage(req, result.page.component, { props: result.page.props });
            await this.respond(req, res, page, { status: statusCode });
            return true;
        } catch (err) {
            this.logger.error(
                'handleExceptionsUsing failed; sending the default error response',
                err instanceof Error ? err.stack : String(err),
            );
            return false;
        }
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
        const back = path ?? inertiaHttpAdapter.sameOriginReferer(req) ?? '/';
        if (errors) this.writeFlash(res, { errors });
        inertiaHttpAdapter.redirect(res, 303, back);
    }

    /**
     * Flash arbitrary one-off data (e.g. a success toast) to be read on the
     * next request via `page.flash`. Unlike `share()`, this data does not
     * persist beyond the next response. Does not redirect — call this before
     * issuing your own redirect.
     */
    flash<TResponse extends HttpResponseLike = HttpResponseLike>(
        res: TResponse,
        data: Record<string, unknown>,
    ): void {
        this.writeFlash(res, { flash: data });
    }

    /**
     * Keep the original request's URL fragment (`#section`) across the redirect
     * this response issues, e.g. a form posted from `/page#comments` that
     * redirects back. Call before redirecting.
     */
    preserveFragment<TResponse extends HttpResponseLike = HttpResponseLike>(res: TResponse): void {
        this.writeFlash(res, { preserveFragment: true });
    }

    /**
     * Everything flashed during one response goes into one cookie, merged, so
     * flash(), validation errors and preserveFragment() don't overwrite each other.
     */
    private writeFlash(res: HttpResponseLike, data: Record<string, unknown>): void {
        const state = inertiaHttpAdapter.raw(res);
        const pending: Record<string, any> = state.__inertiaFlashOut ?? {};
        state.__inertiaFlashOut = {
            ...pending,
            ...data,
            ...(data.flash ? { flash: { ...pending.flash, ...(data.flash as object) } } : {}),
        };
        inertiaHttpAdapter.setCookie(res, '__inertia_flash', JSON.stringify(state.__inertiaFlashOut), {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 10_000,
            path: '/',
        });
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
                    if (value.merge) collectMergeMetadata(path, value.merge, ctx);
                    continue;
                }
                try {
                    resolved[key] = await value.fn();
                    if (value.merge) collectMergeMetadata(path, value.merge, ctx);
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

            if (isScroll(value)) {
                // Scrolling up asks for the previous page, which goes on top.
                const strategy: MergeStrategy = {
                    mode: ctx.scrollIntent === 'prepend' ? 'prepend' : 'append',
                    at: value.wrapper,
                };
                if (!ctx.isPartial && value.deferGroup) {
                    (ctx.deferredProps[value.deferGroup] ??= []).push(path);
                    collectMergeMetadata(path, strategy, ctx);
                    continue;
                }
                const page = await value.fn();
                const metadata =
                    typeof value.metadata === 'function' ? value.metadata(page) : value.metadata;
                collectMergeMetadata(path, strategy, ctx);
                ctx.scrollProps[path] = { ...metadata, reset: ctx.reset.includes(path) };
                resolved[key] = page;
                continue;
            }

            if (isOnce(value)) {
                const onceKey = value.key ?? path;
                // Skip it on a normal visit when the client already holds an
                // unexpired copy; an explicit partial reload still resolves it.
                const held = !ctx.isPartial && ctx.isInertia && !value.fresh && ctx.loadedOnce.includes(onceKey);
                if (!held) resolved[key] = await value.fn();
                if (!ctx.isPartial || (matchesOnly(path, ctx) && !matchesExcept(path, ctx))) {
                    ctx.onceProps[onceKey] = {
                        prop: path,
                        expiresAt: value.expiresIn != null ? Date.now() + value.expiresIn : null,
                    };
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
    isInertia: boolean;
    only: string[];
    except: string[];
    reset: string[];
    /** Once-prop keys the client already holds (X-Inertia-Except-Once-Props). */
    loadedOnce: string[];
    /** X-Inertia-Infinite-Scroll-Merge-Intent. */
    scrollIntent?: string;
    onceProps: NonNullable<InertiaPage['onceProps']>;
    scrollProps: NonNullable<InertiaPage['scrollProps']>;
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
    prop: MergeStrategy,
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

/**
 * Replace every BigInt with `{ $bigint: "<digits>" }`, the marker the v3 client
 * turns back into BigInt. Objects are only copied along a path that contains a
 * BigInt, so the common no-BigInt case allocates nothing. Values with their own
 * toJSON (Date, Buffer, …) are left to serialize themselves, and a cycle is left
 * for JSON.stringify to report as before.
 */
function encodeBigInts(input: unknown): { value: unknown; found: boolean } {
    let found = false;
    const ancestors = new Set<object>();

    const walk = (value: unknown): unknown => {
        if (typeof value === 'bigint') {
            found = true;
            return { $bigint: value.toString() };
        }
        if (typeof value !== 'object' || value === null || ancestors.has(value)) return value;
        if (typeof (value as { toJSON?: unknown }).toJSON === 'function') return value;

        ancestors.add(value);
        try {
            let changed = false;
            const track = (item: unknown) => {
                const next = walk(item);
                if (next !== item) changed = true;
                return next;
            };
            const copy = Array.isArray(value)
                ? value.map(track)
                : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, track(v)]));
            return changed ? copy : value;
        } finally {
            ancestors.delete(value);
        }
    };

    return { value: walk(input), found };
}
