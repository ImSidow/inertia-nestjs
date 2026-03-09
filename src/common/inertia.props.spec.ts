import {
    always,
    defer,
    isAlways,
    isDefer,
    isLazy,
    isMerge,
    lazy,
    merge,
} from './inertia.props';

describe('inertia.props', () => {
    it('lazy() returns a function and is detected as lazy', async () => {
        const prop = lazy(async () => 'value');

        expect(typeof prop).toBe('function');
        expect(isLazy(prop)).toBe(true);
        expect(isAlways(prop)).toBe(false);
        expect(isDefer(prop)).toBe(false);
        expect(isMerge(prop)).toBe(false);
        await expect(prop()).resolves.toBe('value');
    });

    it('always() returns an always prop', async () => {
        const prop = always(async () => 'always');

        expect(isAlways(prop)).toBe(true);
        expect(isLazy(prop)).toBe(false);
        expect(isDefer(prop)).toBe(false);
        expect(isMerge(prop)).toBe(false);
        await expect(prop.fn()).resolves.toBe('always');
    });

    it('defer() returns a deferred prop with optional group', async () => {
        const prop = defer(async () => 'deferred', 'table');

        expect(isDefer(prop)).toBe(true);
        expect(isLazy(prop)).toBe(false);
        expect(isAlways(prop)).toBe(false);
        expect(isMerge(prop)).toBe(false);
        expect(prop.group).toBe('table');
        await expect(prop.fn()).resolves.toBe('deferred');
    });

    it('merge() returns a merge prop', async () => {
        const prop = merge(async () => ['a', 'b']);

        expect(isMerge(prop)).toBe(true);
        expect(isLazy(prop)).toBe(false);
        expect(isAlways(prop)).toBe(false);
        expect(isDefer(prop)).toBe(false);
        await expect(prop.fn()).resolves.toEqual(['a', 'b']);
    });
});
