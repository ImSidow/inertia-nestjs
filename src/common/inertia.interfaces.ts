import type { SsrOptions } from '../ssr/ssr-options';
import type { InertiaExceptionHandler } from './inertia-exception-response';

export type InertiaProps = Record<string, unknown>;

export type LazyProp<T = unknown> = () => T | Promise<T>;
export type AlwaysProp<T = unknown> = {
    _type: 'always';
    fn: () => T | Promise<T>;
};
/** How the client merges a prop into the data it already has. */
export type MergeStrategy = {
    /** Defaults to 'append'. */
    mode?: 'append' | 'prepend' | 'deep';
    /** Merge at a nested path (e.g. 'data' for a paginator) instead of the prop root. */
    at?: string;
    /** Item key fields to match on when merging, relative to the prop (e.g. 'id', 'data.id'). */
    matchOn?: string[];
};
export type DeferProp<T = unknown> = {
    _type: 'defer';
    fn: () => T | Promise<T>;
    group?: string;
    rescue?: boolean;
    /** Merge the loaded value into existing client data instead of replacing it. */
    merge?: MergeStrategy;
};
export type MergeProp<T = unknown> = {
    _type: 'merge';
    fn: () => T | Promise<T>;
} & MergeStrategy;
export type OnceProp<T = unknown> = {
    _type: 'once';
    fn: () => T | Promise<T>;
    /** Key the client remembers it under; defaults to the prop path. */
    key?: string;
    /** Milliseconds until the client's copy expires and is fetched again. */
    expiresIn?: number;
    /** Always resend, even when the client already holds it. */
    fresh?: boolean;
};
/** Pagination state the client's <InfiniteScroll> needs. */
export interface ScrollMetadata {
    pageName: string;
    previousPage: number | string | null;
    nextPage: number | string | null;
    currentPage: number | string | null;
}
export type ScrollProp<T = unknown> = {
    _type: 'scroll';
    fn: () => T | Promise<T>;
    /** Key holding the items inside the value, merged on each page. Defaults to 'data'. */
    wrapper: string;
    metadata: ScrollMetadata | ((value: T) => ScrollMetadata);
    /** Deferred group name; load after the first render. */
    deferGroup?: string;
};

export type PropValue =
    | unknown
    | LazyProp
    | AlwaysProp
    | DeferProp
    | MergeProp
    | OnceProp
    | ScrollProp;

/**
 * The Inertia page object sent to the client.
 */
export interface InertiaPage {
    component: string;
    props: InertiaProps;
    url: string;
    version: string;
    encryptHistory?: boolean;
    clearHistory?: boolean;
    deferredProps?: Record<string, string[]>;
    mergeProps?: string[];
    prependProps?: string[];
    deepMergeProps?: string[];
    /** Entries of the form `<propPath>.<keyField>`. */
    matchPropsOn?: string[];
    /** Top-level shared prop keys, carried over by the client on instant visits. */
    sharedProps?: string[];
    /** Deferred props that threw and were rescued (partial reloads only). */
    rescuedProps?: string[];
    /** One-off flash data; the v3 client exposes it via the `inertia:flash` event. */
    flash?: Record<string, unknown>;
    /** Once props by key: the prop path and when the client's copy expires (ms timestamp). */
    onceProps?: Record<string, { prop: string; expiresAt: number | null }>;
    /** Pagination state per infinite-scroll prop. */
    scrollProps?: Record<string, ScrollMetadata & { reset: boolean }>;
    /** Props contain `{ "$bigint": "<digits>" }` markers the client turns into BigInt. */
    preserveBigIntegers?: boolean;
    /** Keep the original request's URL fragment after the redirect that led here. */
    preserveFragment?: boolean;
}

/**
 * Options for InertiaModule.forRoot()
 */
export interface InertiaModuleOptions {
    /**
     * The root view / template name. Defaults to 'app'.
     * Your template engine must render this template with `page` variable.
     */
    rootView?: string;

    /**
     * Current asset version (string or factory function).
     * When the client version doesn't match, Inertia triggers a full page reload.
     */
    version?: string | (() => string | Promise<string>);

    /**
     * Shared props merged into every Inertia response.
     */
    sharedProps?: InertiaProps | (() => InertiaProps | Promise<InertiaProps>);

    /**
     * Whether to encrypt browser history. Defaults to false.
     */
    encryptHistory?: boolean;

    /**
     * SSR options. When provided, SSR is activated using the default HttpGateway.
     */
    ssr?: SsrOptions;

    /**
     * Answer unhandled errors (404s, 500s, …) with an Inertia error page instead
     * of the default JSON, which the client would show raw in its error dialog.
     * Not used for clients that ask for JSON only (`Accept: application/json`).
     * Shared props are included when the Inertia middleware ran for the request.
     *
     * Equivalent to inertia-laravel's `Inertia::handleExceptionsUsing()`.
     */
    handleExceptionsUsing?: InertiaExceptionHandler;
}

/**
 * Options passed to InertiaService.render()
 */
export interface RenderOptions {
    /** Props to merge with shared props */
    props?: Record<string, PropValue>;
    /** Encrypt this page's history entry */
    encryptHistory?: boolean;
    /** Clear all history entries before this page */
    clearHistory?: boolean;
    /** Override the URL sent in the Inertia page object (defaults to req.originalUrl) */
    url?: string;
    /** Override the HTTP status code (defaults to 200) */
    status?: number;
    /** Set to `false` to skip SSR for this route regardless of `ssr.exclude` (falls back to CSR). */
    ssr?: boolean;
}

/**
 * Inertia location response (external redirect)
 */
export interface InertiaLocationResponse {
    url: string;
}
