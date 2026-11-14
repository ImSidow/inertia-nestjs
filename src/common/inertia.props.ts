import {
    AlwaysProp,
    DeferProp,
    LazyProp,
    MergeProp,
    MergeStrategy,
    OnceProp,
    ScrollMetadata,
    ScrollProp,
} from './inertia.interfaces';

/**
 * Wrap a factory in a lazy prop — only evaluated during partial reloads
 * that explicitly request this prop.
 *
 * Equivalent to `Inertia::lazy()` in Laravel.
 */
export function lazy<T>(fn: () => T | Promise<T>): LazyProp<T> {
    return fn;
}

/**
 * Wrap a factory in an "always" prop — evaluated on every request,
 * even partial reloads that don't explicitly include it.
 *
 * Equivalent to `Inertia::always()` in Laravel.
 */
export function always<T>(fn: () => T | Promise<T>): AlwaysProp<T> {
    return { _type: 'always', fn };
}

export interface DeferOptions {
    /** Props in the same group load in one request. Defaults to 'default'. */
    group?: string;
    /** If `fn` throws, omit the prop and list it in `rescuedProps` instead of failing. */
    rescue?: boolean;
    /** Merge the loaded value into existing client data (e.g. "load more"). */
    merge?: boolean | MergeOptions;
    /** Deep-merge the loaded value into existing client data. */
    deepMerge?: boolean | Pick<MergeOptions, 'matchOn'>;
}

/**
 * Wrap a factory in a deferred prop — sent in a separate async request
 * after the initial page load.
 *
 * Equivalent to `Inertia::defer()` in Laravel.
 *
 * @example defer(() => stats, 'sidebar')            // group
 * @example defer(() => comments, { merge: { matchOn: 'id' } })
 */
export function defer<T>(
    fn: () => T | Promise<T>,
    groupOrOptions?: string | DeferOptions,
    rescue?: boolean,
): DeferProp<T> {
    const options: DeferOptions =
        typeof groupOrOptions === 'object' ? groupOrOptions : { group: groupOrOptions, rescue };
    const merge = options.deepMerge
        ? toStrategy({ ...(options.deepMerge === true ? {} : options.deepMerge) }, 'deep')
        : options.merge
          ? toStrategy(options.merge === true ? {} : options.merge)
          : undefined;
    return {
        _type: 'defer',
        fn,
        group: options.group,
        rescue: options.rescue,
        ...(merge ? { merge } : {}),
    };
}

function toStrategy(options: MergeOptions, mode?: 'deep'): MergeStrategy {
    return {
        mode: mode ?? (options.prepend ? 'prepend' : 'append'),
        ...(options.at && !mode ? { at: options.at } : {}),
        ...(options.matchOn ? { matchOn: ([] as string[]).concat(options.matchOn) } : {}),
    };
}

export interface OnceOptions {
    /** Key the client remembers the value under; defaults to the prop path. */
    key?: string;
    /** Milliseconds until the client's copy expires and is fetched again. */
    expiresIn?: number;
    /** Always resend, even when the client already holds it. */
    fresh?: boolean;
}

/**
 * Wrap a factory in a once prop — resolved once, then remembered by the
 * client and skipped on later visits until it expires.
 *
 * Equivalent to `Inertia::once()` in Laravel.
 *
 * @example once(() => this.permissions.all(), { expiresIn: 60 * 60 * 1000 })
 */
export function once<T>(fn: () => T | Promise<T>, options: OnceOptions = {}): OnceProp<T> {
    return { _type: 'once', fn, ...options };
}

export interface ScrollOptions<T> {
    /** Pagination state for <InfiniteScroll>, or a function deriving it from the value. */
    metadata: ScrollMetadata | ((value: T) => ScrollMetadata);
    /** Key holding the items inside the value. Defaults to 'data'. */
    wrapper?: string;
    /** Load after the first render (true, or a deferred group name). */
    defer?: boolean | string;
}

/**
 * Wrap a paginated value for the client's <InfiniteScroll> component. Items
 * under `wrapper` are appended (or prepended, when scrolling up) on each page.
 *
 * Equivalent to `Inertia::scroll()` in Laravel.
 *
 * @example scroll(() => this.posts.page(n), {
 *     metadata: (p) => ({ pageName: 'page', currentPage: p.page, previousPage: p.prev, nextPage: p.next }),
 * })
 */
export function scroll<T>(fn: () => T | Promise<T>, options: ScrollOptions<T>): ScrollProp<T> {
    return {
        _type: 'scroll',
        fn,
        wrapper: options.wrapper ?? 'data',
        metadata: options.metadata,
        ...(options.defer
            ? { deferGroup: typeof options.defer === 'string' ? options.defer : 'default' }
            : {}),
    };
}

export interface MergeOptions {
    /** Prepend new items instead of appending them. */
    prepend?: boolean;
    /** Merge at a nested path (e.g. 'data' for a paginator) instead of the prop root. */
    at?: string;
    /** Item key field(s) used to replace existing items instead of duplicating them. */
    matchOn?: string | string[];
}

/**
 * Wrap a factory in a merge prop — client-side data is merged rather
 * than replaced on subsequent visits.
 *
 * Equivalent to `Inertia::merge()` in Laravel.
 *
 * @example merge(() => posts, { matchOn: 'id' })
 * @example merge(() => paginator, { at: 'data', prepend: true })
 */
export function merge<T>(
    fn: () => T | Promise<T>,
    options: MergeOptions = {},
): MergeProp<T> {
    return { _type: 'merge', fn, ...toStrategy(options) };
}

/**
 * Wrap a factory in a deep-merge prop — nested objects are merged
 * recursively on the client.
 *
 * Equivalent to `Inertia::deepMerge()` in Laravel.
 */
export function deepMerge<T>(
    fn: () => T | Promise<T>,
    options: Pick<MergeOptions, 'matchOn'> = {},
): MergeProp<T> {
    return { _type: 'merge', fn, ...toStrategy(options, 'deep') };
}

/** Type guard: is this an always prop? */
export function isAlways(value: unknown): value is AlwaysProp {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as AlwaysProp)._type === 'always'
    );
}

/** Type guard: is this a deferred prop? */
export function isDefer(value: unknown): value is DeferProp {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as DeferProp)._type === 'defer'
    );
}

/** Type guard: is this a merge prop? */
export function isMerge(value: unknown): value is MergeProp {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as MergeProp)._type === 'merge'
    );
}

/** Type guard: is this a once prop? */
export function isOnce(value: unknown): value is OnceProp {
    return typeof value === 'object' && value !== null && (value as OnceProp)._type === 'once';
}

/** Type guard: is this an infinite-scroll prop? */
export function isScroll(value: unknown): value is ScrollProp {
    return typeof value === 'object' && value !== null && (value as ScrollProp)._type === 'scroll';
}

/** Type guard: is this a lazy prop (plain function, not always/defer/merge)? */
export function isLazy(value: unknown): value is LazyProp {
    return typeof value === 'function';
}
