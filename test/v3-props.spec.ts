import { defer, merge, once, scroll } from 'src/common/inertia.props';
import { InertiaService } from 'src/services/inertia.service';

const service = () => new InertiaService({ rootView: 'app', version: '1' });
const full = { headers: {}, url: '/p', originalUrl: '/p', method: 'GET' };
const visit = (headers: Record<string, string> = {}) => ({
    ...full,
    headers: { 'x-inertia': 'true', ...headers },
});
const partial = (headers: Record<string, string>) =>
    visit({ 'x-inertia-partial-component': 'Page', ...headers });

describe('defer() with merge', () => {
    const props = { comments: defer(async () => [{ id: 2 }], { group: 'c', merge: { matchOn: 'id' } }) };

    it('lists the deferred prop with its merge metadata on the full load', async () => {
        const page = await service().buildPage(full, 'Page', { props });
        expect(page.props).toEqual({ errors: {} });
        expect(page.deferredProps).toEqual({ c: ['comments'] });
        expect(page.mergeProps).toEqual(['comments']);
        expect(page.matchPropsOn).toEqual(['comments.id']);
    });

    it('resolves and keeps merge metadata on the deferred partial reload', async () => {
        const page = await service().buildPage(partial({ 'x-inertia-partial-data': 'comments' }), 'Page', { props });
        expect(page.props).toEqual({ errors: {}, comments: [{ id: 2 }] });
        expect(page.mergeProps).toEqual(['comments']);
    });

    it('supports deep merge and the old positional (group, rescue) form', async () => {
        const page = await service().buildPage(full, 'Page', {
            props: {
                settings: defer(() => ({}), { deepMerge: true }),
                legacy: defer(() => 1, 'g', true),
            },
        });
        expect(page.deepMergeProps).toEqual(['settings']);
        expect(page.deferredProps).toEqual({ default: ['settings'], g: ['legacy'] });
    });
});

describe('once()', () => {
    const props = () => ({ permissions: once(() => ['edit'], { expiresIn: 60_000 }), plans: once(() => ['pro'], { key: 'plans-v2' }) });

    it('resolves on the first visit and reports onceProps with an expiry', async () => {
        const before = Date.now();
        const page = await service().buildPage(visit(), 'Page', { props: props() });
        expect(page.props).toEqual({ errors: {}, permissions: ['edit'], plans: ['pro'] });
        expect(page.onceProps!.permissions.prop).toBe('permissions');
        expect(page.onceProps!.permissions.expiresAt).toBeGreaterThanOrEqual(before + 60_000);
        expect(page.onceProps!['plans-v2']).toEqual({ prop: 'plans', expiresAt: null });
    });

    it('skips props the client already holds but still reports them', async () => {
        const page = await service().buildPage(
            visit({ 'x-inertia-except-once-props': 'permissions,plans-v2' }),
            'Page',
            { props: props() },
        );
        expect(page.props).toEqual({ errors: {} });
        expect(Object.keys(page.onceProps!)).toEqual(['permissions', 'plans-v2']);
    });

    it('always sends fresh once props, and resolves on an explicit partial reload', async () => {
        const fresh = await service().buildPage(visit({ 'x-inertia-except-once-props': 'p' }), 'Page', {
            props: { p: once(() => 1, { fresh: true }) },
        });
        expect(fresh.props.p).toBe(1);

        const reload = await service().buildPage(
            partial({ 'x-inertia-partial-data': 'permissions', 'x-inertia-except-once-props': 'permissions' }),
            'Page',
            { props: props() },
        );
        expect(reload.props).toEqual({ errors: {}, permissions: ['edit'] });
        expect(Object.keys(reload.onceProps!)).toEqual(['permissions']);
    });

    it('ignores the except-once header on a non-Inertia (first HTML) load', async () => {
        const page = await service().buildPage(
            { ...full, headers: { 'x-inertia-except-once-props': 'permissions' } },
            'Page',
            { props: props() },
        );
        expect(page.props.permissions).toEqual(['edit']);
    });
});

describe('scroll()', () => {
    const posts = (page: number) => ({ data: [{ id: page }], page, last: 3 });
    const props = (page: number, extra = {}) => ({
        posts: scroll(() => posts(page), {
            metadata: (p) => ({
                pageName: 'page',
                currentPage: p.page,
                previousPage: p.page > 1 ? p.page - 1 : null,
                nextPage: p.page < p.last ? p.page + 1 : null,
            }),
            ...extra,
        }),
    });

    it('appends at the wrapper and reports scrollProps', async () => {
        const page = await service().buildPage(visit(), 'Page', { props: props(2) });
        expect(page.props.posts).toEqual(posts(2));
        expect(page.mergeProps).toEqual(['posts.data']);
        expect(page.scrollProps).toEqual({
            posts: { pageName: 'page', currentPage: 2, previousPage: 1, nextPage: 3, reset: false },
        });
    });

    it('prepends when scrolling up, and marks reset', async () => {
        const up = await service().buildPage(
            partial({ 'x-inertia-partial-data': 'posts', 'x-inertia-infinite-scroll-merge-intent': 'prepend' }),
            'Page',
            { props: props(1) },
        );
        expect(up.prependProps).toEqual(['posts.data']);
        expect(up).not.toHaveProperty('mergeProps');

        const reset = await service().buildPage(
            partial({ 'x-inertia-partial-data': 'posts', 'x-inertia-reset': 'posts' }),
            'Page',
            { props: props(1) },
        );
        expect(reset).not.toHaveProperty('mergeProps');
        expect(reset.scrollProps!.posts.reset).toBe(true);
    });

    it('can be deferred', async () => {
        const page = await service().buildPage(full, 'Page', { props: props(1, { defer: 'feed' }) });
        expect(page.props).toEqual({ errors: {} });
        expect(page.deferredProps).toEqual({ feed: ['posts'] });
        expect(page).not.toHaveProperty('scrollProps');
    });
});

describe('BigInt values', () => {
    it('encodes BigInt anywhere in the props and sets preserveBigIntegers', async () => {
        const page = await service().buildPage(full, 'Page', {
            props: { user: { id: 9007199254740993n, tags: [1n, 'x'] }, count: 3 },
        });
        expect(page.props).toEqual({
            errors: {},
            user: { id: { $bigint: '9007199254740993' }, tags: [{ $bigint: '1' }, 'x'] },
            count: 3,
        });
        expect(page.preserveBigIntegers).toBe(true);
        expect(() => JSON.stringify(page)).not.toThrow();
    });

    it('encodes BigInt inside class instances and leaves toJSON values alone', async () => {
        class Row {
            constructor(public id: bigint) {}
        }
        const at = new Date('2026-01-01T00:00:00Z');
        const page = await service().buildPage(full, 'Page', { props: { row: new Row(5n), at } });
        expect(JSON.parse(JSON.stringify(page.props))).toEqual({
            errors: {},
            row: { id: { $bigint: '5' } },
            at: '2026-01-01T00:00:00.000Z',
        });
    });

    it('returns the same objects and no flag when there is no BigInt', async () => {
        const users = [{ id: 1 }];
        const page = await service().buildPage(full, 'Page', { props: { users } });
        expect(page.props.users).toBe(users);
        expect(page).not.toHaveProperty('preserveBigIntegers');
    });
});

describe('flash cookie writes in one response', () => {
    it('merges flash(), errors and preserveFragment() instead of overwriting', () => {
        const headers = new Map<string, unknown>();
        const res = {
            getHeader: (n: string) => headers.get(n.toLowerCase()),
            setHeader: (n: string, v: unknown) => headers.set(n.toLowerCase(), v),
            redirect: () => undefined,
        };
        const svc = service();
        svc.flash(res as never, { message: 'a' });
        svc.flash(res as never, { other: 'b' });
        svc.preserveFragment(res as never);
        svc.redirectBack({ headers: {} } as never, res as never, { email: 'bad' });

        const cookies = ([] as string[]).concat(headers.get('set-cookie') as string[]);
        expect(cookies).toHaveLength(1);
        const value = JSON.parse(decodeURIComponent(cookies[0].split(';')[0].split('=')[1]));
        expect(value).toEqual({ flash: { message: 'a', other: 'b' }, preserveFragment: true, errors: { email: 'bad' } });
    });
});

// Keep the merge() helper import used (ensures the shared option builder still works).
it('merge() still defaults to append', () => {
    expect(merge(() => 1)).toMatchObject({ mode: 'append' });
});
