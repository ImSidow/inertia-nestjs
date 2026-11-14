import type { Mock } from 'vitest';
import { InertiaValidationFilter } from 'src/filters/inertia-validation.filter';
import { InertiaService } from 'src/services/inertia.service';
import { Logger } from '@nestjs/common';
import { InertiaResponseHandledException } from 'src/common/inertia-response-handled.exception';

function makeException(status: number, response: unknown) {
    return { getStatus: () => status, getResponse: () => response };
}

function makeRes(headersSent = false) {
    return {
        headersSent,
        setHeader: vi.fn(),
        getHeader: vi.fn(),
        json: vi.fn(),
        send: vi.fn(),
        status: vi.fn().mockReturnThis(),
        code: vi.fn().mockReturnThis(),
    };
}

function makeHost(req: Record<string, unknown>, res: ReturnType<typeof makeRes>) {
    return {
        switchToHttp: () => ({
            getRequest: () => req,
            getResponse: () => res,
        }),
    } as any;
}

describe('InertiaValidationFilter', () => {
    let filter: InertiaValidationFilter;
    let inertia: { redirectBack: Mock; render: Mock; renderException: Mock };

    beforeEach(() => {
        inertia = {
            redirectBack: vi.fn(),
            render: vi.fn().mockResolvedValue(undefined),
            renderException: vi.fn().mockResolvedValue(false),
        };
        filter = new InertiaValidationFilter(inertia as unknown as InertiaService);
    });

    it('ends an "already rendered" signal quietly, e.g. for a request the client cancelled', async () => {
        const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const res = { ...makeRes(false), end: vi.fn() };
        await filter.catch(new InertiaResponseHandledException(), makeHost({ headers: {} }, res as never));
        expect(error).not.toHaveBeenCalled();
        expect(res.end).toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
        error.mockRestore();
    });

    it('treats a Fastify reply as sent when its raw response is', async () => {
        const res = { ...makeRes(false), raw: { headersSent: true } };
        await filter.catch(makeException(400, { errors: { a: 'b' } }), makeHost({ headers: {} }, res as never));
        expect(res.json).not.toHaveBeenCalled();
        expect(inertia.redirectBack).not.toHaveBeenCalled();
    });

    it('returns early when headers already sent', async () => {
        const res = makeRes(true);
        await filter.catch(makeException(409, 'err'), makeHost({}, res));
        expect(res.json).not.toHaveBeenCalled();
        expect(inertia.redirectBack).not.toHaveBeenCalled();
    });

    it('sends 500 JSON for non-HTTP exceptions', async () => {
        const res = makeRes();
        await filter.catch(new Error('boom'), makeHost({}, res));
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }));
    });

    it('passes through as JSON when no decorator is present (no codes)', async () => {
        const res = makeRes();
        const req: Record<string, unknown> = {};
        await filter.catch(makeException(409, { message: 'Conflict' }), makeHost(req, res));
        expect(res.json).toHaveBeenCalledWith({ message: 'Conflict' });
        expect(inertia.redirectBack).not.toHaveBeenCalled();
    });

    it('passes through as JSON when codes=[409] and exception status is 422', async () => {
        const res = makeRes();
        const req: Record<string, unknown> = { inertiaHandleExceptionCodes: [409] };
        await filter.catch(makeException(422, { message: 'Unprocessable' }), makeHost(req, res));
        expect(res.json).toHaveBeenCalled();
        expect(inertia.redirectBack).not.toHaveBeenCalled();
    });

    it('catches matching code and calls redirectBack on Inertia request', async () => {
        const res = makeRes();
        const req: Record<string, unknown> = {
            inertiaHandleExceptionCodes: [409],
            headers: { 'x-inertia': 'true' },
        };
        await filter.catch(makeException(409, { errors: { delete: 'Cannot delete' } }), makeHost(req, res));
        expect(inertia.redirectBack).toHaveBeenCalledWith(req, res, { delete: 'Cannot delete' }, undefined);
    });

    it('catches any code when codes==="all" on Inertia request', async () => {
        const res = makeRes();
        const req: Record<string, unknown> = {
            inertiaHandleExceptionCodes: 'all',
            headers: { 'x-inertia': 'true' },
        };
        await filter.catch(makeException(403, { errors: { access: 'Forbidden' } }), makeHost(req, res));
        expect(inertia.redirectBack).toHaveBeenCalled();
    });

    it('passes returnPath through to redirectBack', async () => {
        const res = makeRes();
        const req: Record<string, unknown> = {
            inertiaHandleExceptionCodes: 'all',
            inertiaReturnPath: '/products',
            headers: { 'x-inertia': 'true' },
        };
        await filter.catch(makeException(409, { errors: { delete: 'err' } }), makeHost(req, res));
        expect(inertia.redirectBack).toHaveBeenCalledWith(req, res, { delete: 'err' }, '/products');
    });

    it('re-renders component on non-Inertia request with component set', async () => {
        const res = makeRes();
        const req: Record<string, unknown> = {
            inertiaHandleExceptionCodes: [400],
            inertiaValidateComponent: 'Users/Create',
            headers: {},
        };
        await filter.catch(makeException(400, { errors: { name: 'Required' } }), makeHost(req, res));
        expect(inertia.render).toHaveBeenCalledWith(req, res, 'Users/Create', expect.objectContaining({ status: 422 }));
    });

    it('normalizes plain string response to { error: message }', async () => {
        const res = makeRes();
        const req: Record<string, unknown> = {
            inertiaHandleExceptionCodes: 'all',
            headers: { 'x-inertia': 'true' },
        };
        await filter.catch(makeException(500, 'Something went wrong'), makeHost(req, res));
        expect(inertia.redirectBack).toHaveBeenCalledWith(req, res, { error: 'Something went wrong' }, undefined);
    });

    it('normalizes { message } response to { error: message }', async () => {
        const res = makeRes();
        const req: Record<string, unknown> = {
            inertiaHandleExceptionCodes: 'all',
            headers: { 'x-inertia': 'true' },
        };
        await filter.catch(makeException(400, { message: 'Bad input' }), makeHost(req, res));
        expect(inertia.redirectBack).toHaveBeenCalledWith(req, res, { error: 'Bad input' }, undefined);
    });
});
