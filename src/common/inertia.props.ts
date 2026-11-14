import {
    AlwaysProp,
    DeferProp,
    LazyProp,
    MergeProp,
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

/**
 * Wrap a factory in a deferred prop — sent in a separate async request
 * after the initial page load.
 *
 * Equivalent to `Inertia::defer()` in Laravel.
 */
export function defer<T>(
    fn: () => T | Promise<T>,
    group?: string,
    rescue?: boolean,
): DeferProp<T> {
    return { _type: 'defer', fn, group, rescue };
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
    return {
        _type: 'merge',
        fn,
        mode: options.prepend ? 'prepend' : 'append',
        ...(options.at ? { at: options.at } : {}),
        ...(options.matchOn ? { matchOn: ([] as string[]).concat(options.matchOn) } : {}),
    };
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
    return {
        _type: 'merge',
        fn,
        mode: 'deep',
        ...(options.matchOn ? { matchOn: ([] as string[]).concat(options.matchOn) } : {}),
    };
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

/** Type guard: is this a lazy prop (plain function, not always/defer/merge)? */
export function isLazy(value: unknown): value is LazyProp {
    return typeof value === 'function';
}
