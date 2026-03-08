import { InertiaService } from './inertia.service';
import { always, defer, lazy, merge } from '../common/inertia.props';
import { HttpRequestLike, HttpResponseLike } from '../adapters';

function makeReq(overrides: Partial<HttpRequestLike> = {}): HttpRequestLike {
    return {
        headers: {},
        method: 'GET',
        url: '/test',
        originalUrl: '/test',
        ...overrides,
    } as unknown as HttpRequestLike;
}

function makeRes(): {
    res: HttpResponseLike;
    json: jest.Mock;
    render: jest.Mock;
    status: jest.Mock;
    setHeader: jest.Mock;
    redirect: jest.Mock;
} {
    const json = jest.fn();
    const render = jest.fn();
    const setHeader = jest.fn().mockReturnThis();
    const status = jest.fn().mockReturnThis();
    const redirect = jest.fn();
    const res = {
        json,
        render,
        setHeader,
        status,
        redirect,
    } as unknown as HttpResponseLike;
    return { res, json, render, status, setHeader, redirect };
}

describe('InertiaService', () => {
    let service: InertiaService;

    beforeEach(() => {
        service = new InertiaService({ rootView: 'app', version: '1.0.0' });
    });

    // -------------------------------------------------------------------------
    // Version
    // -------------------------------------------------------------------------

    describe('getVersion()', () => {
        it('returns string version', async () => {
            expect(await service.getVersion()).toBe('1.0.0');
        });

        it('returns version from factory function', async () => {
            service.setVersion(() => '2.0.0');
            expect(await service.getVersion()).toBe('2.0.0');
        });

        it('returns version from async factory', async () => {
            service.setVersion(async () => '3.0.0');
            expect(await service.getVersion()).toBe('3.0.0');
        });
    });

    // -------------------------------------------------------------------------
    // Sharing
    // -------------------------------------------------------------------------

    describe('share()', () => {
        it('stores shared props', () => {
            service.share('appName', 'My App');
            expect(service.getShared('appName')).toBe('My App');
        });

        it('flushes shared props', () => {
            service.share('foo', 'bar');
            service.flushShared();
            expect(service.getShared('foo')).toBeUndefined();
        });
    });

    // -------------------------------------------------------------------------
    // First page load (non-Inertia request)
    // -------------------------------------------------------------------------

    describe('render() — first page load', () => {
        it('calls res.render with root view and page data', async () => {
            const req = makeReq();
            const { res, render } = makeRes();

            await service.render(req, res, 'Home/Index', {
                props: { greeting: 'hello' },
            });

            expect(render).toHaveBeenCalledWith('app', {
                page: expect.objectContaining({
                    component: 'Home/Index',
                    props: { greeting: 'hello' },
                    url: '/test',
                    version: '1.0.0',
                }),
            });
        });

        it('skips lazy props on first load', async () => {
            const req = makeReq();
            const { res, render } = makeRes();

            await service.render(req, res, 'Page', {
                props: { eager: 'yes', late: lazy(() => 'nope') },
            });

            const page = (render as jest.Mock).mock.calls[0][1].page;
            expect(page.props.eager).toBe('yes');
            expect(page.props.late).toBeUndefined();
        });

        it('skips deferred props on first load but includes them in deferredProps metadata', async () => {
            const req = makeReq();
            const { res, render } = makeRes();

            await service.render(req, res, 'Page', {
                props: { data: defer(() => 'heavy', 'group1') },
            });

            const page = (render as jest.Mock).mock.calls[0][1].page;
            expect(page.props.data).toBeUndefined();
            expect(page.deferredProps).toEqual({ group1: ['data'] });
        });

        it('includes always props on first load', async () => {
            const req = makeReq();
            const { res, render } = makeRes();

            await service.render(req, res, 'Page', {
                props: { critical: always(() => 42) },
            });

            const page = (render as jest.Mock).mock.calls[0][1].page;
            expect(page.props.critical).toBe(42);
        });

        it('includes merge props and sets mergeProps metadata', async () => {
            const req = makeReq();
            const { res, render } = makeRes();

            await service.render(req, res, 'Page', {
                props: { items: merge(() => [1, 2, 3]) },
            });

            const page = (render as jest.Mock).mock.calls[0][1].page;
            expect(page.props.items).toEqual([1, 2, 3]);
            expect(page.mergeProps).toEqual(['items']);
        });
    });

    // -------------------------------------------------------------------------
    // Inertia XHR request (partial reload)
    // -------------------------------------------------------------------------

    describe('render() — Inertia XHR request', () => {
        it('returns JSON with X-Inertia header', async () => {
            const req = makeReq({
                headers: { 'x-inertia': 'true' },
            });
            const { res, json, setHeader, status } = makeRes();

            await service.render(req, res, 'Home/Index', {
                props: { foo: 'bar' },
            });

            expect(status).toHaveBeenCalledWith(200);
            expect(setHeader).toHaveBeenCalledWith('x-inertia', 'true');
            expect(json).toHaveBeenCalledWith(
                expect.objectContaining({ component: 'Home/Index' }),
            );
        });

        it('respects partial reload X-Inertia-Partial-Data header', async () => {
            const req = makeReq({
                headers: {
                    'x-inertia': 'true',
                    'x-inertia-partial-component': 'Page',
                    'x-inertia-partial-data': 'users',
                },
            });
            const { res, json } = makeRes();

            await service.render(req, res, 'Page', {
                props: {
                    users: lazy(() => ['alice', 'bob']),
                    settings: lazy(() => ({ theme: 'dark' })),
                },
            });

            const page = (json as jest.Mock).mock.calls[0][0];
            expect(page.props.users).toEqual(['alice', 'bob']);
            expect(page.props.settings).toBeUndefined();
        });

        it('respects partial reload X-Inertia-Partial-Except header', async () => {
            const req = makeReq({
                headers: {
                    'x-inertia': 'true',
                    'x-inertia-partial-component': 'Page',
                    'x-inertia-partial-except': 'settings',
                },
            });
            const { res, json } = makeRes();

            await service.render(req, res, 'Page', {
                props: {
                    users: () => ['alice'],
                    settings: () => ({ theme: 'dark' }),
                },
            });

            const page = (json as jest.Mock).mock.calls[0][0];
            expect(page.props.users).toEqual(['alice']);
            expect(page.props.settings).toBeUndefined();
        });
    });

    // -------------------------------------------------------------------------
    // location()
    // -------------------------------------------------------------------------

    describe('location()', () => {
        it('redirects normally on first page load', () => {
            const { res, redirect } = makeRes();
            service.location(res, 'https://example.com');
            expect(redirect).toHaveBeenCalledWith(302, 'https://example.com');
        });

        it('responds 409 with X-Inertia-Location on Inertia requests', () => {
            const { res, status, setHeader } = makeRes();
            (res.getHeader as jest.Mock) = jest.fn().mockReturnValue('true');
            service.location(res, 'https://example.com');
            expect(status).toHaveBeenCalledWith(409);
            expect(setHeader).toHaveBeenCalledWith(
                'x-inertia-location',
                'https://example.com',
            );
        });
    });

    // -------------------------------------------------------------------------
    // encryptHistory / clearHistory
    // -------------------------------------------------------------------------

    describe('encryptHistory / clearHistory', () => {
        it('sets encryptHistory on the page object', async () => {
            const req = makeReq();
            const { res, render } = makeRes();

            await service.render(req, res, 'Page', { encryptHistory: true });

            const page = (render as jest.Mock).mock.calls[0][1].page;
            expect(page.encryptHistory).toBe(true);
        });

        it('sets clearHistory on the page object', async () => {
            const req = makeReq();
            const { res, render } = makeRes();

            await service.render(req, res, 'Page', { clearHistory: true });

            const page = (render as jest.Mock).mock.calls[0][1].page;
            expect(page.clearHistory).toBe(true);
        });
    });
});
