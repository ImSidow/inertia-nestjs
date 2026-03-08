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
): DeferProp<T> {
    return { _type: 'defer', fn, group };
}

/**
 * Wrap a factory in a merge prop — client-side data is merged rather
 * than replaced on subsequent visits.
 *
 * Equivalent to `Inertia::merge()` in Laravel.
 */
export function merge<T>(fn: () => T | Promise<T>): MergeProp<T> {
    return { _type: 'merge', fn };
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
