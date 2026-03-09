import { defer, lazy, merge } from '../common/inertia.props';
import { InertiaService } from './inertia.service';

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
            appName: 'My App',
            users: [{ id: 1, name: 'Alice' }],
        });
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
            summary: 'Quick summary',
            posts: [{ id: 1 }],
        });
        expect(page.deferredProps).toEqual({
            default: ['chartData'],
        });
        expect(page.mergeProps).toEqual(['posts']);
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
