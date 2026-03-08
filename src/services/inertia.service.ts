import { Injectable, Scope } from '@nestjs/common';
import {
    HttpRequestLike,
    HttpResponseLike,
    inertiaHttpAdapter,
} from '../adapters';
import {
    InertiaModuleOptions,
    InertiaPage,
    InertiaProps,
    PropValue,
    RenderOptions,
} from '../common/inertia.interfaces';
import {
    INERTIA_CLEAR_HISTORY_HEADER,
    INERTIA_ENCRYPT_HISTORY_HEADER,
    INERTIA_ERROR_BAG_HEADER,
    INERTIA_HEADER,
    INERTIA_LOCATION_HEADER,
    INERTIA_PARTIAL_COMPONENT_HEADER,
    INERTIA_PARTIAL_DATA_HEADER,
    INERTIA_PARTIAL_EXCEPT_HEADER,
    INERTIA_VERSION_HEADER,
} from '../common/inertia.constants';
import { isAlways, isDefer, isLazy, isMerge } from '../common/inertia.props';

/**
 * Core Inertia service.
 *
 * Equivalent to the `Inertia` facade / `ResponseFactory` in inertia-laravel.
 * Handles building Inertia page responses, sharing props, and location redirects.
 */
@Injectable({ scope: Scope.DEFAULT })
export class InertiaService {
    private sharedProps: Record<string, PropValue> = {};
    private rootView: string;
    private version: string | (() => string | Promise<string>);
    private encryptHistory: boolean;

    constructor(private readonly options: InertiaModuleOptions) {
        this.rootView = options.rootView ?? 'app';
        this.version = options.version ?? '';
        this.encryptHistory = options.encryptHistory ?? false;

        if (options.sharedProps) {
            if (typeof options.sharedProps === 'function') {
                // lazy shared props factory
                this.share('__factory__', options.sharedProps as PropValue);
            } else {
                Object.entries(options.sharedProps).forEach(([key, value]) => {
                    this.share(key, value as PropValue);
                });
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Sharing
    // ---------------------------------------------------------------------------

    /**
     * Share a prop with all Inertia responses.
     *
     * Equivalent to `Inertia::share()` in Laravel.
     *
     * @example
     * inertia.share('auth', () => ({ user: request.user }));
     */
    share(key: string, value: PropValue): this {
        this.sharedProps[key] = value;
        return this;
    }

    /**
     * Retrieve a specific shared prop by dot-notation key.
     *
     * Equivalent to `Inertia::getShared()` in Laravel.
     */
    getShared(key?: string): Record<string, PropValue> | PropValue | undefined {
        if (!key) return this.sharedProps;
        return this.sharedProps[key];
    }

    /**
     * Flush / clear all shared props.
     *
     * Equivalent to `Inertia::flushShared()` in Laravel.
     */
    flushShared(): this {
        this.sharedProps = {};
        return this;
    }

    // ---------------------------------------------------------------------------
    // Version
    // ---------------------------------------------------------------------------

    /**
     * Set the current asset version.
     *
     * Equivalent to `Inertia::version()` in Laravel.
     */
    setVersion(version: string | (() => string | Promise<string>)): this {
        this.version = version;
        return this;
    }

    /**
     * Resolve the current asset version.
     */
    async getVersion(): Promise<string> {
        if (typeof this.version === 'function') {
            return String(await this.version());
        }
        return String(this.version ?? '');
    }

    // ---------------------------------------------------------------------------
    // Root view
    // ---------------------------------------------------------------------------

    /**
     * Set the root HTML template/view name.
     *
     * Equivalent to `Inertia::setRootView()` in Laravel.
     */
    setRootView(rootView: string): this {
        this.rootView = rootView;
        return this;
    }

    getRootView(): string {
        return this.rootView;
    }

    // ---------------------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------------------

    /**
     * Render an Inertia response.
     *
     * Equivalent to `Inertia::render()` in Laravel.
     *
     * @param req      - Incoming HTTP request
     * @param res      - Outgoing HTTP response
     * @param component - The client-side component name (e.g. 'Users/Index')
     * @param options  - Props and page options
     */
    async render(
        req: HttpRequestLike,
        res: HttpResponseLike,
        component: string,
        options: RenderOptions = {},
    ): Promise<void> {
        const responseState = res as HttpResponseLike & {
            headersSent?: boolean;
            __inertiaHandled?: boolean;
        };

        if (responseState.headersSent || responseState.__inertiaHandled) {
            return;
        }

        responseState.__inertiaHandled = true;

        const { props = {}, encryptHistory, clearHistory } = options;

        const isInertiaRequest = !!inertiaHttpAdapter.getHeader(
            req,
            INERTIA_HEADER,
        );

        const partialComponent = inertiaHttpAdapter.getHeader(
            req,
            INERTIA_PARTIAL_COMPONENT_HEADER,
        );
        const isPartial = isInertiaRequest && partialComponent === component;

        // Resolve which props to include
        const resolvedProps = await this.resolveProps(
            { ...this.sharedProps, ...props },
            isPartial,
            isPartial ? this.parsePartialData(req) : undefined,
            isPartial ? this.parsePartialExcept(req) : undefined,
        );

        const currentVersion = await this.getVersion();

        // Build deferred props metadata (groups)
        const deferredProps = this.buildDeferredGroups({
            ...this.sharedProps,
            ...props,
        });
        // Build merge props list
        const mergeProps = this.buildMergeList({
            ...this.sharedProps,
            ...props,
        });

        const page: InertiaPage = {
            component,
            props: resolvedProps,
            url: inertiaHttpAdapter.getRequestUrl(req),
            version: currentVersion,
            ...(encryptHistory !== undefined
                ? { encryptHistory }
                : this.encryptHistory
                  ? { encryptHistory: true }
                  : {}),
            ...(clearHistory ? { clearHistory: true } : {}),
            ...(Object.keys(deferredProps).length ? { deferredProps } : {}),
            ...(mergeProps.length ? { mergeProps } : {}),
        };

        if (isInertiaRequest) {
            inertiaHttpAdapter.setStatus(res, 200);
            inertiaHttpAdapter.setHeader(
                res,
                'Content-Type',
                'application/json',
            );
            inertiaHttpAdapter.setHeader(res, 'Vary', 'X-Inertia');
            inertiaHttpAdapter.setHeader(res, INERTIA_HEADER, 'true');
            inertiaHttpAdapter.json(res, page);
        } else {
            await inertiaHttpAdapter.renderAsync(res, this.rootView, { page });
        }
    }

    // ---------------------------------------------------------------------------
    // Location (external redirect)
    // ---------------------------------------------------------------------------

    /**
     * Redirect to an external URL (or force a full page visit).
     *
     * Equivalent to `Inertia::location()` in Laravel.
     */
    location(res: HttpResponseLike, url: string): void {
        const isInertiaRequest = inertiaHttpAdapter.getHeaderFromResponse(
            res,
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

    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------

    private parsePartialData(req: HttpRequestLike): string[] {
        const header = inertiaHttpAdapter.getHeader(
            req,
            INERTIA_PARTIAL_DATA_HEADER,
        );
        return header ? header.split(',').map((s) => s.trim()) : [];
    }

    private parsePartialExcept(req: HttpRequestLike): string[] {
        const header = inertiaHttpAdapter.getHeader(
            req,
            INERTIA_PARTIAL_EXCEPT_HEADER,
        );
        return header ? header.split(',').map((s) => s.trim()) : [];
    }

    /**
     * Resolve props, evaluating lazy/always/defer/merge factories.
     */
    private async resolveProps(
        props: Record<string, PropValue>,
        isPartial: boolean,
        only?: string[],
        except?: string[],
    ): Promise<InertiaProps> {
        const resolved: InertiaProps = {};

        for (const [key, value] of Object.entries(props)) {
            // Internal factory key — expand it
            if (key === '__factory__' && typeof value === 'function') {
                const factoryResult = await (
                    value as () => Promise<InertiaProps>
                )();
                Object.assign(resolved, factoryResult);
                continue;
            }

            // Skip deferred props on initial load
            if (!isPartial && isDefer(value)) {
                continue;
            }

            // Lazy props: only evaluate if requested in partial reload
            if (isLazy(value)) {
                if (!isPartial) continue;
                if (only && only.length && !only.includes(key)) continue;
                if (except && except.length && except.includes(key)) continue;
                resolved[key] = await value();
                continue;
            }

            // Always props: evaluate on every request, included even in partial reloads
            if (isAlways(value)) {
                if (only && only.length && !only.includes(key)) {
                    // still skip if not in 'only' list during partial reload
                    if (isPartial) continue;
                }
                if (except && except.includes(key)) continue;
                resolved[key] = await value.fn();
                continue;
            }

            // Merge props: evaluate and include
            if (isMerge(value)) {
                if (isPartial) {
                    if (only && only.length && !only.includes(key)) continue;
                    if (except && except.includes(key)) continue;
                }
                resolved[key] = await value.fn();
                continue;
            }

            // Deferred props on partial reload
            if (isDefer(value)) {
                if (only && only.length && !only.includes(key)) continue;
                if (except && except.includes(key)) continue;
                resolved[key] = await value.fn();
                continue;
            }

            // Plain values and plain (non-lazy) functions
            if (isPartial) {
                if (only && only.length && !only.includes(key)) continue;
                if (except && except.includes(key)) continue;
            }

            if (typeof value === 'function') {
                resolved[key] = await (value as () => unknown)();
            } else {
                resolved[key] = value;
            }
        }

        return resolved;
    }

    /**
     * Build deferred prop groups metadata.
     */
    private buildDeferredGroups(
        props: Record<string, PropValue>,
    ): Record<string, string[]> {
        const groups: Record<string, string[]> = {};

        for (const [key, value] of Object.entries(props)) {
            if (isDefer(value)) {
                const group = value.group ?? 'default';
                if (!groups[group]) groups[group] = [];
                groups[group].push(key);
            }
        }

        return groups;
    }

    /**
     * Build list of merge prop keys.
     */
    private buildMergeList(props: Record<string, PropValue>): string[] {
        return Object.entries(props)
            .filter(([, value]) => isMerge(value))
            .map(([key]) => key);
    }
}
