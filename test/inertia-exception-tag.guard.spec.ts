import { InertiaExceptionTagGuard } from 'src/guards/inertia-exception-tag.guard';
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

function makeContext(req: Record<string, unknown>) {
    return {
        getHandler: () => ({}),
        switchToHttp: () => ({ getRequest: () => req }),
    } as any;
}

describe('InertiaExceptionTagGuard', () => {
    it('always allows the request through', () => {
        const guard = new InertiaExceptionTagGuard(makeReflector());
        const req: Record<string, unknown> = {};
        expect(guard.canActivate(makeContext(req))).toBe(true);
    });

    it('does not tag the request when no decorators are present', () => {
        const guard = new InertiaExceptionTagGuard(makeReflector());
        const req: Record<string, unknown> = {};
        guard.canActivate(makeContext(req));
        expect(req).not.toHaveProperty('inertiaHandleExceptionCodes');
    });

    it('tags codes="all" when @InertiaHandleException() has no codes option', () => {
        const guard = new InertiaExceptionTagGuard(makeReflector({}));
        const req: Record<string, unknown> = {};
        guard.canActivate(makeContext(req));
        expect(req.inertiaHandleExceptionCodes).toBe('all');
    });

    it('tags specific codes array when @InertiaHandleException({ codes: [409] })', () => {
        const guard = new InertiaExceptionTagGuard(makeReflector({ codes: [409] }));
        const req: Record<string, unknown> = {};
        guard.canActivate(makeContext(req));
        expect(req.inertiaHandleExceptionCodes).toEqual([409]);
    });

    it('tags [400] when only @InertiaValidate is present', () => {
        const guard = new InertiaExceptionTagGuard(makeReflector(undefined, 'Users/Index'));
        const req: Record<string, unknown> = {};
        guard.canActivate(makeContext(req));
        expect(req.inertiaHandleExceptionCodes).toContain(400);
    });

    it('tags returnPath on the request when provided', () => {
        const guard = new InertiaExceptionTagGuard(makeReflector({ returnPath: '/products' }));
        const req: Record<string, unknown> = {};
        guard.canActivate(makeContext(req));
        expect(req.inertiaReturnPath).toBe('/products');
    });

    it('runs before route-level guards would throw, so tagging survives a guard-thrown exception', () => {
        // This is the whole point of the fix: this guard is registered as a global
        // APP_GUARD, which NestJS always runs before controller/method-level guards.
        // So even if a later guard (e.g. an auth guard) throws, the request is
        // already tagged by the time that happens.
        const guard = new InertiaExceptionTagGuard(makeReflector({ codes: [401] }));
        const req: Record<string, unknown> = {};
        guard.canActivate(makeContext(req));
        expect(req.inertiaHandleExceptionCodes).toEqual([401]);
    });
});
