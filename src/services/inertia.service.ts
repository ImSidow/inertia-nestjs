import { Inject, Injectable, Optional, Scope } from '@nestjs/common';
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
    INERTIA_HEADER,
    INERTIA_LOCATION_HEADER,
    INERTIA_PARTIAL_COMPONENT_HEADER,
    INERTIA_PARTIAL_DATA_HEADER,
    INERTIA_PARTIAL_EXCEPT_HEADER,
} from '../common/inertia.constants';
import { isAlways, isDefer, isLazy, isMerge } from '../common/inertia.props';
import { SSR_GATEWAY, SsrGateway } from '../ssr/ssr-gateway.interface';

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

    share(key: string, value: PropValue): this {
        this.sharedProps[key] = value;
        return this;
    }

    getShared(key?: string): Record<string, PropValue> | PropValue | undefined {
        if (!key) return this.sharedProps;
        return this.sharedProps[key];
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

        const combinedProps = { ...this.sharedProps, ...props };

        const resolvedProps = await this.resolveProps(
            combinedProps,
            isPartial,
            isPartial ? this.parsePartialData(req) : undefined,
            isPartial ? this.parsePartialExcept(req) : undefined,
        );

        const currentVersion = await this.getVersion();
        const deferredProps = this.buildDeferredGroups(combinedProps);
        const mergeProps = this.buildMergeList(combinedProps);

        return {
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
    }

    async respond<
        TRequest extends HttpRequestLike = HttpRequestLike,
        TResponse extends HttpResponseLike = HttpResponseLike,
    >(req: TRequest, res: TResponse, page: InertiaPage): Promise<void> {
        const isInertiaRequest = !!inertiaHttpAdapter.getHeader(
            req,
            INERTIA_HEADER,
        );

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
            return;
        }

        const ssrResponse = this.ssrGateway
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

        await this.respond(req, res, page);
    }

    location<TResponse extends HttpResponseLike = HttpResponseLike>(
        res: TResponse,
        url: string,
    ): void {
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

    private async resolveProps(
        props: Record<string, PropValue>,
        isPartial: boolean,
        only?: string[],
        except?: string[],
    ): Promise<InertiaProps> {
        const resolved: InertiaProps = {};

        for (const [key, value] of Object.entries(props)) {
            if (key === '__factory__' && typeof value === 'function') {
                const factoryResult = await (
                    value as () => Promise<InertiaProps>
                )();
                Object.assign(resolved, factoryResult);
                continue;
            }

            if (!isPartial && isDefer(value)) {
                continue;
            }

            if (isLazy(value)) {
                if (!isPartial) continue;
                if (only && only.length && !only.includes(key)) continue;
                if (except && except.length && except.includes(key)) continue;
                resolved[key] = await value();
                continue;
            }

            if (isAlways(value)) {
                if (only && only.length && !only.includes(key)) {
                    if (isPartial) continue;
                }
                if (except && except.includes(key)) continue;
                resolved[key] = await value.fn();
                continue;
            }

            if (isMerge(value)) {
                if (isPartial) {
                    if (only && only.length && !only.includes(key)) continue;
                    if (except && except.includes(key)) continue;
                }
                resolved[key] = await value.fn();
                continue;
            }

            if (isDefer(value)) {
                if (only && only.length && !only.includes(key)) continue;
                if (except && except.includes(key)) continue;
                resolved[key] = await value.fn();
                continue;
            }

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

    private buildMergeList(props: Record<string, PropValue>): string[] {
        return Object.entries(props)
            .filter(([, value]) => isMerge(value))
            .map(([key]) => key);
    }
}
