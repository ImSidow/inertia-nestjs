import { resolveInertiaHandleExceptionCodes } from 'src/common/resolve-inertia-handle-exception-codes';
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

describe('resolveInertiaHandleExceptionCodes', () => {
    it('returns codes=undefined when neither decorator is present', () => {
        const result = resolveInertiaHandleExceptionCodes(makeReflector(), (() => {}) as any);
        expect(result.codes).toBeUndefined();
    });

    it('returns codes="all" when @InertiaHandleException() has no codes option', () => {
        const result = resolveInertiaHandleExceptionCodes(makeReflector({}), (() => {}) as any);
        expect(result.codes).toBe('all');
    });

    it('returns specific codes array when @InertiaHandleException({ codes: [409] })', () => {
        const result = resolveInertiaHandleExceptionCodes(makeReflector({ codes: [409] }), (() => {}) as any);
        expect(result.codes).toEqual([409]);
    });

    it('returns [400] when only @InertiaValidate is present', () => {
        const result = resolveInertiaHandleExceptionCodes(makeReflector(undefined, 'Users/Index'), (() => {}) as any);
        expect(result.codes).toContain(400);
    });

    it('combines @InertiaHandleException codes with 400 from @InertiaValidate', () => {
        const result = resolveInertiaHandleExceptionCodes(makeReflector({ codes: [409] }, 'Users/Index'), (() => {}) as any);
        expect(result.codes).toEqual(expect.arrayContaining([400, 409]));
    });

    it('returns returnPath when provided', () => {
        const result = resolveInertiaHandleExceptionCodes(makeReflector({ returnPath: '/products' }), (() => {}) as any);
        expect(result.returnPath).toBe('/products');
    });

    it('leaves returnPath undefined when not provided', () => {
        const result = resolveInertiaHandleExceptionCodes(makeReflector({}), (() => {}) as any);
        expect(result.returnPath).toBeUndefined();
    });
});
