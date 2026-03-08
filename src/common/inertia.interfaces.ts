import type { SsrOptions } from '../ssr/ssr-options';

export type InertiaProps = Record<string, unknown>;

export type LazyProp<T = unknown> = () => T | Promise<T>;
export type AlwaysProp<T = unknown> = {
    _type: 'always';
    fn: () => T | Promise<T>;
};
export type DeferProp<T = unknown> = {
    _type: 'defer';
    fn: () => T | Promise<T>;
    group?: string;
};
export type MergeProp<T = unknown> = {
    _type: 'merge';
    fn: () => T | Promise<T>;
};

export type PropValue = unknown | LazyProp | AlwaysProp | DeferProp | MergeProp;

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
}

/**
 * Inertia location response (external redirect)
 */
export interface InertiaLocationResponse {
    url: string;
}
