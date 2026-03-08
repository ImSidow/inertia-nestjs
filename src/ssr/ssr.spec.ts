import { existsSync } from 'fs';
import { BundleDetector } from './bundle-detector';
import { HttpGateway } from './http-gateway';
import { InertiaPage } from '../common/inertia.interfaces';
import { InertiaService } from '../services/inertia.service';
import { SsrGateway } from './ssr-gateway.interface';
import { SsrResponse } from './ssr-response';

jest.mock('fs', () => ({
    existsSync: jest.fn(),
}));

const mockedExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;

const fakePage: InertiaPage = {
    component: 'Home/Index',
    props: { greeting: 'hello' },
    url: '/',
    version: '1.0.0',
};

describe('BundleDetector', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns false when custom bundle path does not exist', () => {
        mockedExistsSync.mockReturnValue(false);

        const detector = new BundleDetector('/nonexistent/path/ssr.js');

        expect(detector.detect()).toBe(false);
    });

    it('resolvePath() returns undefined when nothing is found', () => {
        mockedExistsSync.mockReturnValue(false);

        const detector = new BundleDetector('/nonexistent/ssr.js');

        expect(detector.resolvePath()).toBeUndefined();
    });

    it('returns false with default paths when none exist', () => {
        mockedExistsSync.mockReturnValue(false);

        const detector = new BundleDetector();

        expect(detector.detect()).toBe(false);
    });

    it('returns first resolved path when a bundle exists', () => {
        mockedExistsSync.mockImplementation((path) =>
            String(path).includes('bootstrap/ssr/ssr.js'),
        );

        const detector = new BundleDetector();

        expect(detector.detect()).toBe(true);
        expect(detector.resolvePath()).toContain('bootstrap/ssr/ssr.js');
    });
});

describe('HttpGateway', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedExistsSync.mockReturnValue(true);
        (global as typeof global & { fetch?: jest.Mock }).fetch = jest.fn();
    });

    it('returns null when enabled is false', async () => {
        const gateway = new HttpGateway({ enabled: false });

        expect(await gateway.dispatch(fakePage)).toBeNull();
    });

    it('returns null when no SSR bundle is detected', async () => {
        mockedExistsSync.mockReturnValue(false);

        const gateway = new HttpGateway({
            enabled: true,
            url: 'http://127.0.0.1:13714',
        });

        expect(await gateway.dispatch(fakePage)).toBeNull();
    });

    it('returns null when fetch throws', async () => {
        global.fetch = jest
            .fn()
            .mockRejectedValue(new Error('ECONNREFUSED')) as jest.Mock;

        const gateway = new HttpGateway({
            enabled: true,
            url: 'http://127.0.0.1:13714',
        });

        expect(await gateway.dispatch(fakePage)).toBeNull();
    });

    it('returns null when SSR server responds with non-ok status', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 500,
        }) as jest.Mock;

        const gateway = new HttpGateway({
            enabled: true,
            url: 'http://127.0.0.1:13714',
        });

        expect(await gateway.dispatch(fakePage)).toBeNull();
    });

    it('returns null when SSR response body is invalid', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ head: [] }),
        }) as jest.Mock;

        const gateway = new HttpGateway({
            enabled: true,
            url: 'http://127.0.0.1:13714',
        });

        expect(await gateway.dispatch(fakePage)).toBeNull();
    });

    it('returns SsrResponse when SSR server responds correctly', async () => {
        const ssrPayload: SsrResponse = {
            head: [
                '<title>Home</title>',
                '<meta name="description" content="Hello">',
            ],
            body: '<div id="app"><h1>Hello SSR</h1></div>',
        };

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ssrPayload,
        }) as jest.Mock;

        const gateway = new HttpGateway({
            enabled: true,
            url: 'http://127.0.0.1:13714',
        });

        const result = await gateway.dispatch(fakePage);

        expect(result).not.toBeNull();
        expect(result?.body).toBe(ssrPayload.body);
        expect(result?.head).toEqual(ssrPayload.head);
    });

    it('normalizes the /render URL correctly', async () => {
        let capturedUrl: string | undefined;

        global.fetch = jest.fn().mockImplementation((url: string) => {
            capturedUrl = url;

            return Promise.resolve({
                ok: true,
                json: async () => ({
                    head: [],
                    body: '<div />',
                }),
            });
        }) as jest.Mock;

        const gateway = new HttpGateway({
            enabled: true,
            url: 'http://127.0.0.1:13714/render',
        });

        await gateway.dispatch(fakePage);

        expect(capturedUrl).toBe('http://127.0.0.1:13714/render');
    });
});

function makeReq(overrides: Record<string, unknown> = {}) {
    return {
        headers: {},
        method: 'GET',
        url: '/test',
        originalUrl: '/test',
        ...overrides,
    } as never;
}

function makeRes() {
    const headers = new Map<string, string>();

    const res: {
        headersSent: boolean;
        statusCode?: number;
        render: jest.Mock;
        json: jest.Mock;
        end: jest.Mock;
        redirect: jest.Mock;
        status: jest.Mock;
        setHeader: jest.Mock;
        getHeader: jest.Mock;
    } = {
        headersSent: false,
        render: jest.fn().mockResolvedValue(undefined),
        json: jest.fn(),
        end: jest.fn(),
        redirect: jest.fn(),
        status: jest.fn(),
        setHeader: jest.fn(),
        getHeader: jest.fn(),
    };

    res.status.mockImplementation((code: number) => {
        res.statusCode = code;
        return res;
    });

    res.setHeader.mockImplementation((key: string, value: string) => {
        headers.set(key.toLowerCase(), value);
        return res;
    });

    res.getHeader.mockImplementation((key: string) => {
        return headers.get(String(key).toLowerCase());
    });

    return {
        res: res as never,
        render: res.render,
        json: res.json,
    };
}

describe('InertiaService with SSR gateway', () => {
    it('passes ssrHead and ssrBody to render when gateway returns a response', async () => {
        const mockGateway: SsrGateway = {
            dispatch: jest.fn().mockResolvedValue({
                head: ['<title>SSR Title</title>'],
                body: '<div id="app"><h1>SSR</h1></div>',
            }),
        };

        const service = new InertiaService({ rootView: 'app' }, mockGateway);
        const req = makeReq();
        const { res, render } = makeRes();

        await service.render(req, res, 'Home/Index');

        expect(render).toHaveBeenCalledWith(
            'app',
            expect.objectContaining({
                ssrHead: ['<title>SSR Title</title>'],
                ssrBody: '<div id="app"><h1>SSR</h1></div>',
            }),
            expect.any(Function),
        );
    });

    it('passes ssrHead=[] and ssrBody=null when gateway returns null', async () => {
        const mockGateway: SsrGateway = {
            dispatch: jest.fn().mockResolvedValue(null),
        };

        const service = new InertiaService({ rootView: 'app' }, mockGateway);
        const req = makeReq();
        const { res, render } = makeRes();

        await service.render(req, res, 'Home/Index');

        expect(render).toHaveBeenCalledWith(
            'app',
            expect.objectContaining({
                ssrHead: [],
                ssrBody: null,
            }),
            expect.any(Function),
        );
    });

    it('skips SSR for Inertia requests', async () => {
        const mockGateway: SsrGateway = {
            dispatch: jest.fn(),
        };

        const service = new InertiaService({ rootView: 'app' }, mockGateway);
        const req = makeReq({ headers: { 'x-inertia': 'true' } });
        const { res, json } = makeRes();

        await service.render(req, res, 'Home/Index');

        expect(mockGateway.dispatch).not.toHaveBeenCalled();
        expect(json).toHaveBeenCalled();
    });

    it('works correctly with no gateway provided', async () => {
        const service = new InertiaService({ rootView: 'app' });
        const req = makeReq();
        const { res, render } = makeRes();

        await service.render(req, res, 'Home/Index');

        expect(render).toHaveBeenCalledWith(
            'app',
            expect.objectContaining({
                ssrHead: [],
                ssrBody: null,
            }),
            expect.any(Function),
        );
    });
});
