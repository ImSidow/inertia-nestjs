import { ArgumentsHost, Catch, ExceptionFilter, Injectable } from '@nestjs/common';
import { inertiaHttpAdapter } from '../adapters/http-adapter.utils';
import { HttpRequestLike, HttpResponseLike } from '../adapters';
import { INERTIA_HEADER, INERTIA_VALIDATE_REDIRECT_BACK } from '../common/inertia.constants';
import { InertiaService } from '../services/inertia.service';

type ErrorBag = Record<string, string | string[]>;

function normalizeToErrors(response: unknown): ErrorBag {
    if (typeof response === 'string') {
        return { error: response };
    }
    if (typeof response === 'object' && response !== null) {
        if ('errors' in response && typeof (response as { errors: unknown }).errors === 'object') {
            const raw = (response as { errors: Record<string, unknown> }).errors;
            return Object.fromEntries(
                Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v as string[] : String(v)]),
            ) as ErrorBag;
        }
        if ('message' in response) {
            const msg = (response as { message: unknown }).message;
            return { error: Array.isArray(msg) ? (msg as string[]) : String(msg) };
        }
    }
    return { error: 'An error occurred' };
}

function isHttpException(e: unknown): e is { getStatus(): number; getResponse(): unknown } {
    return (
        typeof e === 'object' &&
        e !== null &&
        typeof (e as { getStatus?: unknown }).getStatus === 'function' &&
        typeof (e as { getResponse?: unknown }).getResponse === 'function'
    );
}

@Injectable()
@Catch()
export class InertiaValidationFilter implements ExceptionFilter {
    constructor(private readonly inertia: InertiaService) {}

    async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
        const ctx = host.switchToHttp();
        const req = ctx.getRequest<HttpRequestLike>();
        const res = ctx.getResponse<HttpResponseLike>();

        if ((res as { headersSent?: boolean }).headersSent) return;

        if (!isHttpException(exception)) {
            inertiaHttpAdapter.setStatus(res, 500);
            inertiaHttpAdapter.json(res, { statusCode: 500, message: 'Internal server error' });
            return;
        }

        const status = exception.getStatus();
        const codes = (req as Record<string, unknown>).inertiaHandleExceptionCodes as number[] | 'all' | undefined;

        if (!codes || (codes !== 'all' && !codes.includes(status))) {
            const body = exception.getResponse();
            inertiaHttpAdapter.setStatus(res, status);
            inertiaHttpAdapter.json(res, typeof body === 'string' ? { statusCode: status, message: body } : body);
            return;
        }

        const errors = normalizeToErrors(exception.getResponse());
        const isInertia = !!inertiaHttpAdapter.getHeader(req, INERTIA_HEADER);

        if (isInertia) {
            const returnPath = (req as Record<string, unknown>).inertiaReturnPath as string | undefined;
            this.inertia.redirectBack(req, res, errors as Record<string, string>, returnPath);
            return;
        }

        const component = (req as Record<string, unknown>).inertiaValidateComponent as string | undefined;
        if (component && component !== INERTIA_VALIDATE_REDIRECT_BACK) {
            await this.inertia.render(req, res, component, {
                props: { errors },
                status: 422,
            });
            return;
        }

        inertiaHttpAdapter.setStatus(res, status);
        inertiaHttpAdapter.json(res, exception.getResponse());
    }
}
