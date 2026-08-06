import { always, defer, lazy, merge } from 'src/common/inertia.props';
import { InertiaService } from 'src/services/inertia.service';

describe('InertiaService', () => {
    function createResponseMock() {
        const headers = new Map<string, string>();

        const res = {
            status: jest.fn().mockReturnThis(),
            code: jest.fn().mockReturnThis(),
            setHeader: jest
                .fn()
                .mockImplementation((name: string, value: string) => {
                    headers.set(name.toLowerCase(), value);
                    return res;
                }),
            getHeader: jest.fn().mockImplementation((name: string) => {
                return headers.get(name.toLowerCase());
            }),
            json: jest.fn().mockReturnThis(),
            send: jest.fn().mockReturnThis(),
            end: jest.fn().mockReturnThis(),
            redirect: jest.fn().mockReturnThis(),
            app: {
                render: jest
                    .fn()
                    .mockImplementation(
                        (
                            _view: string,
                            locals: Record<string, unknown>,
                            callback: (
                                err: Error | null,
                                html?: string,
                            ) => void,
                        ) => {
                            callback(
                                null,
                                `<html><head>${((locals.ssrHead as string[]) ?? []).join('')}</head><body><div id="app">${locals.ssrBody ?? ''}</div></body></html>`,
                            );
                        },
                    ),
            },
        };

        return { res, headers };
    }

    it('buildPage() merges shared props and route props', async () => {
        const service = new InertiaService({
            rootView: 'app',
            version: '1.0.0',
            sharedProps: {
                appName: 'My App',
            },
        });

        const page = await service.buildPage(
            {
                headers: {},
                url: '/users',
                originalUrl: '/users',
                method: 'GET',
            },
            'Users/Index',
            {
                props: {
                    users: [{ id: 1, name: 'Alice' }],
                },
            },
        );

        expect(page.component).toBe('Users/Index');
        expect(page.url).toBe('/users');
        expect(page.version).toBe('1.0.0');
        expect(page.props).toEqual({
            errors: {},
            appName: 'My App',
            users: [{ id: 1, name: 'Alice' }],
        });
    });

    it('share(key, value, req) scopes the value to that request only, not the singleton', async () => {
        const service = new InertiaService({ rootView: 'app', version: '1.0.0' });

        const reqA = { headers: {}, url: '/a', originalUrl: '/a', method: 'GET' };
        const reqB = { headers: {}, url: '/b', originalUrl: '/b', method: 'GET' };

        service.share('auth', { user: 'alice' }, reqA);
        service.share('auth', { user: 'bob' }, reqB);

        const pageA = await service.buildPage(reqA, 'Home');
        const pageB = await service.buildPage(reqB, 'Home');

        expect(pageA.props.auth).toEqual({ user: 'alice' });
        expect(pageB.props.auth).toEqual({ user: 'bob' });
    });

    it('share(key, value, req) never contaminates a request that shared nothing', async () => {
        const service = new InertiaService({ rootView: 'app', version: '1.0.0' });

        const reqA = { headers: {}, url: '/a', originalUrl: '/a', method: 'GET' };
        const reqC = { headers: {}, url: '/c', originalUrl: '/c', method: 'GET' };

        service.share('auth', { user: 'alice' }, reqA);

        const pageC = await service.buildPage(reqC, 'Home');

        expect(pageC.props.auth).toBeUndefined();
    });

    it('share(key, value) without a request still applies globally to every request (bootstrap-time use)', async () => {
        const service = new InertiaService({ rootView: 'app', version: '1.0.0' });

        service.share('appName', 'My App');

        const reqA = { headers: {}, url: '/a', originalUrl: '/a', method: 'GET' };
        const reqB = { headers: {}, url: '/b', originalUrl: '/b', method: 'GET' };

        const pageA = await service.buildPage(reqA, 'Home');
        const pageB = await service.buildPage(reqB, 'Home');

        expect(pageA.props.appName).toBe('My App');
        expect(pageB.props.appName).toBe('My App');
    });

    it('getShared() combines global and request-scoped values without leaking between requests', () => {
        const service = new InertiaService({ rootView: 'app', version: '1.0.0' });

        const reqA = { headers: {}, url: '/a', originalUrl: '/a', method: 'GET' };
        const reqB = { headers: {}, url: '/b', originalUrl: '/b', method: 'GET' };

        service.share('appName', 'My App');
        service.share('auth', { user: 'alice' }, reqA);

        expect(service.getShared(undefined, reqA)).toEqual({
            appName: 'My App',
            auth: { user: 'alice' },
        });
        expect(service.getShared(undefined, reqB)).toEqual({ appName: 'My App' });
        expect(service.getShared('auth', reqA)).toEqual({ user: 'alice' });
        expect(service.getShared('auth', reqB)).toBeUndefined();
    });

    it('buildPage() resolves only requested lazy props during partial reload', async () => {
        const service = new InertiaService({
            rootView: 'app',
            version: '1.0.0',
        });

        const page = await service.buildPage(
            {
                headers: {
                    'x-inertia': 'true',
                    'x-inertia-partial-component': 'Users/Index',
                    'x-inertia-partial-data': 'permissions',
                },
                url: '/users',
                originalUrl: '/users',
                method: 'GET',
            },
            'Users/Index',
            {
                props: {
                    users: [{ id: 1, name: 'Alice' }],
                    permissions: lazy(async () => ['create', 'update']),
                },
            },
        );

        expect(page.props).toEqual({
            permissions: ['create', 'update'],
        });
    });

    it('buildPage() still includes always() props during a partial reload that did not request them', async () => {
        const service = new InertiaService({
            rootView: 'app',
            version: '1.0.0',
        });

        const page = await service.buildPage(
            {
                headers: {
                    'x-inertia': 'true',
                    'x-inertia-partial-component': 'Users/Index',
                    'x-inertia-partial-data': 'permissions',
                },
                url: '/users',
                originalUrl: '/users',
                method: 'GET',
            },
            'Users/Index',
            {
                props: {
                    auth: always(() => ({ user: 'alice' })),
                    permissions: lazy(async () => ['create', 'update']),
                },
            },
        );

        expect(page.props).toEqual({
            auth: { user: 'alice' },
            permissions: ['create', 'update'],
        });
    });

    it('buildPage() excludes deferred props on first load but includes deferred metadata', async () => {
        const service = new InertiaService({
            rootView: 'app',
            version: '1.0.0',
        });

        const page = await service.buildPage(
            {
                headers: {},
                url: '/reports',
                originalUrl: '/reports',
                method: 'GET',
            },
            'Reports/Show',
            {
                props: {
                    summary: 'Quick summary',
                    chartData: defer(async () => ({ points: [1, 2, 3] })),
                    posts: merge(async () => [{ id: 1 }]),
                },
            },
        );

        expect(page.props).toEqual({
            errors: {},
            summary: 'Quick summary',
            posts: [{ id: 1 }],
        });
        expect(page.deferredProps).toEqual({
            default: ['chartData'],
        });
        expect(page.mergeProps).toEqual(['posts']);
    });

    function readFlashCookie(headers: Map<string, string>): unknown {
        const cookie = headers.get('set-cookie')!;
        const value = decodeURIComponent(cookie.split('=')[1].split(';')[0]);
        return JSON.parse(value);
    }

    it('redirectBack() flashes errors that buildPage() surfaces as props.errors on the next request', async () => {
        const service = new InertiaService({ rootView: 'app', version: '1.0.0' });
        const { res, headers } = createResponseMock();

        service.redirectBack(
            { headers: {}, url: '/users', originalUrl: '/users', method: 'POST' },
            res,
            { name: 'is required' },
        );

        const flashed = readFlashCookie(headers);

        const page = await service.buildPage(
            {
                headers: {},
                url: '/users',
                originalUrl: '/users',
                method: 'GET',
                __inertiaFlash: flashed,
            } as never,
            'Users/Create',
        );

        expect(page.props.errors).toEqual({ name: 'is required' });
    });

    it('flash() sets arbitrary data that buildPage() surfaces as props.flash on the next request', async () => {
        const service = new InertiaService({ rootView: 'app', version: '1.0.0' });
        const { res, headers } = createResponseMock();

        service.flash(res, { message: 'Saved!' });

        const flashed = readFlashCookie(headers);

        const page = await service.buildPage(
            {
                headers: {},
                url: '/users',
                originalUrl: '/users',
                method: 'GET',
                __inertiaFlash: flashed,
            } as never,
            'Users/Index',
        );

        expect(page.props.flash).toEqual({ message: 'Saved!' });
    });

    it('location() returns 409 + X-Inertia-Location for an Inertia request', () => {
        const service = new InertiaService({ rootView: 'app', version: '1.0.0' });
        const { res, headers } = createResponseMock();
        const req = {
            headers: { 'x-inertia': 'true' },
            url: '/',
            originalUrl: '/',
            method: 'GET',
        };

        service.location(req, res, 'https://example.com');

        expect(res.status).toHaveBeenCalledWith(409);
        expect(headers.get('x-inertia-location')).toBe('https://example.com');
    });

    it('location() issues a plain redirect for a non-Inertia request', () => {
        const service = new InertiaService({ rootView: 'app', version: '1.0.0' });
        const { res } = createResponseMock();
        const req = { headers: {}, url: '/', originalUrl: '/', method: 'GET' };

        service.location(req, res, 'https://example.com');

        expect(res.redirect).toHaveBeenCalledWith(302, 'https://example.com');
    });

    it('buildPage() excludes a lazy prop nested inside a plain object on a full (non-partial) load', async () => {
        const service = new InertiaService({
            rootView: 'app',
            version: '1.0.0',
        });

        const page = await service.buildPage(
            {
                headers: {},
                url: '/users/1',
                originalUrl: '/users/1',
                method: 'GET',
            },
            'Users/Show',
            {
                props: {
                    profile: {
                        name: 'Alice',
                        avatar: lazy(async () => 'avatar.png'),
                    },
                },
            },
        );

        expect(page.props).toEqual({
            errors: {},
            profile: { name: 'Alice' },
        });
    });

    it('buildPage() resolves a lazy prop nested inside a plain object when the parent key is requested in a partial reload', async () => {
        const service = new InertiaService({
            rootView: 'app',
            version: '1.0.0',
        });

        const page = await service.buildPage(
            {
                headers: {
                    'x-inertia': 'true',
                    'x-inertia-partial-component': 'Users/Show',
                    'x-inertia-partial-data': 'profile',
                },
                url: '/users/1',
                originalUrl: '/users/1',
                method: 'GET',
            },
            'Users/Show',
            {
                props: {
                    profile: {
                        name: 'Alice',
                        avatar: lazy(async () => 'avatar.png'),
                    },
                },
            },
        );

        expect(page.props).toEqual({
            profile: { name: 'Alice', avatar: 'avatar.png' },
        });
    });

    it('buildPage() resolves a throwing deferred prop to null when rescue is true', async () => {
        const service = new InertiaService({
            rootView: 'app',
            version: '1.0.0',
        });

        const page = await service.buildPage(
            {
                headers: {
                    'x-inertia': 'true',
                    'x-inertia-partial-component': 'Reports/Show',
                    'x-inertia-partial-data': 'chartData',
                },
                url: '/reports',
                originalUrl: '/reports',
                method: 'GET',
            },
            'Reports/Show',
            {
                props: {
                    chartData: defer(async () => {
                        throw new Error('boom');
                    }, 'default', true),
                },
            },
        );

        expect(page.props).toEqual({ chartData: null });
    });

    it('buildPage() propagates a throwing deferred prop when rescue is not set', async () => {
        const service = new InertiaService({
            rootView: 'app',
            version: '1.0.0',
        });

        const build = service.buildPage(
            {
                headers: {
                    'x-inertia': 'true',
                    'x-inertia-partial-component': 'Reports/Show',
                    'x-inertia-partial-data': 'chartData',
                },
                url: '/reports',
                originalUrl: '/reports',
                method: 'GET',
            },
            'Reports/Show',
            {
                props: {
                    chartData: defer(async () => {
                        throw new Error('boom');
                    }),
                },
            },
        );

        await expect(build).rejects.toThrow('boom');
    });

    it('respond() returns JSON for Inertia requests', async () => {
        const service = new InertiaService({
            rootView: 'app',
            version: '1.0.0',
        });

        const { res, headers } = createResponseMock();

        await service.respond(
            {
                headers: {
                    'x-inertia': 'true',
                },
                url: '/users',
                originalUrl: '/users',
                method: 'GET',
            },
            res,
            {
                component: 'Users/Index',
                props: { users: [] },
                url: '/users',
                version: '1.0.0',
            },
        );

        expect(res.status).toHaveBeenCalledWith(200);
        expect(headers.get('content-type')).toBe('application/json');
        expect(headers.get('vary')).toBe('X-Inertia');
        expect(headers.get('x-inertia')).toBe('true');
        expect(res.json).toHaveBeenCalledWith({
            component: 'Users/Index',
            props: { users: [] },
            url: '/users',
            version: '1.0.0',
        });
    });

    it('respond() renders root view on first load and injects SSR output when available', async () => {
        const gateway = {
            dispatch: jest.fn().mockResolvedValue({
                head: ['<title>SSR</title>'],
                body: '<h1>SSR CONTENT</h1>',
            }),
        };

        const service = new InertiaService(
            {
                rootView: 'app',
                version: '1.0.0',
            },
            gateway,
        );

        const { res } = createResponseMock();

        await service.respond(
            {
                headers: {},
                url: '/',
                originalUrl: '/',
                method: 'GET',
            },
            res,
            {
                component: 'Home/Index',
                props: { message: 'hello' },
                url: '/',
                version: '1.0.0',
            },
        );

        expect(gateway.dispatch).toHaveBeenCalled();
        expect(res.send).toHaveBeenCalledWith(
            expect.stringContaining('<h1>SSR CONTENT</h1>'),
        );
        expect(res.send).toHaveBeenCalledWith(
            expect.stringContaining('<title>SSR</title>'),
        );
    });
});
