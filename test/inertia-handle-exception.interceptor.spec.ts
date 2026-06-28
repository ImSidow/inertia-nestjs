import { Observable } from 'rxjs';
import { InertiaHandleExceptionInterceptor } from 'src/interceptors/inertia-handle-exception.interceptor';
import { INERTIA_HANDLE_EXCEPTION_KEY } from 'src/common/inertia.constants';
import { INERTIA_VALIDATE_KEY } from 'src/decorators/inertia-validate.decorator';

function makeReflector(handleMeta?: unknown, validateKey?: string) {
    return {
        get: jest.fn((key: string) => {
            if (key === INERTIA_HANDLE_EXCEPTION_KEY) return handleMeta;
            if (key === INERTIA_VALIDATE_KEY) return validateKey;
            return undefined;
        }),
    } as any;
}

function makeContext(req: Record<string, unknown>, res: Record<string, unknown>) {
    return {
        getHandler: () => ({}),
        switchToHttp: () => ({
            getRequest: () => req,
            getResponse: () => res,
        }),
    } as any;
}

function makeHandler(value: unknown = undefined) {
    return { handle: () => new Observable((sub) => { sub.next(value); sub.complete(); }) };
}

async function collect<T>(obs: Observable<T>): Promise<T[]> {
    return new Promise((resolve, reject) => {
        const values: T[] = [];
        obs.subscribe({ next: (v) => values.push(v), complete: () => resolve(values), error: reject });
    });
}

describe('InertiaHandleExceptionInterceptor', () => {
    it('passes through with no decorators, does not set codes', async () => {
        const interceptor = new InertiaHandleExceptionInterceptor(makeReflector());
        const req: Record<string, unknown> = {};
        const res = { headersSent: false, redirect: jest.fn() };
        const values = await collect(interceptor.intercept(makeContext(req, res), makeHandler('data')));
        expect(values).toEqual(['data']);
        expect(req).not.toHaveProperty('inertiaHandleExceptionCodes');
    });

    it('sets codes="all" when @InertiaHandleException() has no codes option', async () => {
        const interceptor = new InertiaHandleExceptionInterceptor(makeReflector({}));
        const req: Record<string, unknown> = { headers: {} };
        const res = { headersSent: true, redirect: jest.fn() };
        await collect(interceptor.intercept(makeContext(req, res), makeHandler()));
        expect(req.inertiaHandleExceptionCodes).toBe('all');
    });

    it('sets specific codes array when @InertiaHandleException({ codes: [409] })', async () => {
        const interceptor = new InertiaHandleExceptionInterceptor(makeReflector({ codes: [409] }));
        const req: Record<string, unknown> = { headers: {} };
        const res = { headersSent: true, redirect: jest.fn() };
        await collect(interceptor.intercept(makeContext(req, res), makeHandler()));
        expect(req.inertiaHandleExceptionCodes).toEqual([409]);
    });

    it('sets [400] when only @InertiaValidate is present', async () => {
        const interceptor = new InertiaHandleExceptionInterceptor(makeReflector(undefined, 'Users/Index'));
        const req: Record<string, unknown> = { headers: {} };
        const res = { headersSent: true, redirect: jest.fn() };
        await collect(interceptor.intercept(makeContext(req, res), makeHandler()));
        expect(req.inertiaHandleExceptionCodes).toContain(400);
    });

    it('combines @InertiaHandleException codes with 400 from @InertiaValidate', async () => {
        const interceptor = new InertiaHandleExceptionInterceptor(makeReflector({ codes: [409] }, 'Users/Index'));
        const req: Record<string, unknown> = { headers: {} };
        const res = { headersSent: true, redirect: jest.fn() };
        await collect(interceptor.intercept(makeContext(req, res), makeHandler()));
        expect(req.inertiaHandleExceptionCodes).toEqual(expect.arrayContaining([400, 409]));
    });

    it('stores returnPath on request when provided', async () => {
        const interceptor = new InertiaHandleExceptionInterceptor(makeReflector({ returnPath: '/products' }));
        const req: Record<string, unknown> = { headers: {} };
        const res = { headersSent: true, redirect: jest.fn() };
        await collect(interceptor.intercept(makeContext(req, res), makeHandler()));
        expect(req.inertiaReturnPath).toBe('/products');
    });

    it('redirects to returnPath on success when headers not sent', async () => {
        const interceptor = new InertiaHandleExceptionInterceptor(makeReflector({ returnPath: '/products' }));
        const req: Record<string, unknown> = { headers: {} };
        const res = { headersSent: false, redirect: jest.fn() };
        const values = await collect(interceptor.intercept(makeContext(req, res), makeHandler()));
        expect(values).toHaveLength(0); // EMPTY — interceptor consumed the value
        expect(res.redirect).toHaveBeenCalledWith(303, '/products');
    });

    it('falls back to Referer header when no returnPath', async () => {
        const interceptor = new InertiaHandleExceptionInterceptor(makeReflector({}));
        const req: Record<string, unknown> = { headers: { referer: '/back' } };
        const res = { headersSent: false, redirect: jest.fn() };
        await collect(interceptor.intercept(makeContext(req, res), makeHandler()));
        expect(res.redirect).toHaveBeenCalledWith(303, '/back');
    });

    it('falls back to "/" when no returnPath and no Referer', async () => {
        const interceptor = new InertiaHandleExceptionInterceptor(makeReflector({}));
        const req: Record<string, unknown> = { headers: {} };
        const res = { headersSent: false, redirect: jest.fn() };
        await collect(interceptor.intercept(makeContext(req, res), makeHandler()));
        expect(res.redirect).toHaveBeenCalledWith(303, '/');
    });

    it('passes value through when headers already sent (response was rendered)', async () => {
        const interceptor = new InertiaHandleExceptionInterceptor(makeReflector({}));
        const req: Record<string, unknown> = { headers: {} };
        const res = { headersSent: true, redirect: jest.fn() };
        const values = await collect(interceptor.intercept(makeContext(req, res), makeHandler('rendered')));
        expect(values).toEqual(['rendered']);
        expect(res.redirect).not.toHaveBeenCalled();
    });
});
