import { ArgumentsHost, Catch, ExceptionFilter, Injectable, Logger } from '@nestjs/common';
import { inertiaHttpAdapter } from '../adapters/http-adapter.utils';
import { HttpRequestLike, HttpResponseLike } from '../adapters';
import { INERTIA_HEADER, INERTIA_VALIDATE_REDIRECT_BACK } from '../common/inertia.constants';
import { InertiaResponseHandledException } from '../common/inertia-response-handled.exception';
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
    private readonly logger = new Logger('InertiaValidationFilter');

    constructor(private readonly inertia: InertiaService) {}

    async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
        const ctx = host.switchToHttp();
        const req = ctx.getRequest<HttpRequestLike>();
        const res = ctx.getResponse<HttpResponseLike>();
        // Fastify's reply has no headersSent/writableEnded; its raw Node response does.
        const raw = inertiaHttpAdapter.raw(res);

        // Not an error: @Inertia() pages signal "already rendered" this way. It
        // also arrives for requests the client cancelled (it does so whenever the
        // user navigates away mid-load), so it must never be logged.
        if (exception instanceof InertiaResponseHandledException) {
            if (!raw.headersSent && !raw.writableEnded) inertiaHttpAdapter.end(res);
            return;
        }

        if (raw.headersSent) return;

        // The app's error page (handleExceptionsUsing) for browsers and Inertia
        // visits; JSON-only clients keep the JSON error.
        const errorPage = (statusCode: number) =>
            !wantsJson(inertiaHttpAdapter.getHeader(req, 'accept')) &&
            this.inertia.renderException(req, res, exception, statusCode);

        if (!isHttpException(exception)) {
            this.logger.error(exception instanceof Error ? exception.message : String(exception), exception instanceof Error ? exception.stack : undefined);
            const cause = exception instanceof Error ? (exception as Error & { cause?: unknown }).cause : undefined;
            if (cause) this.logger.error('Caused by:', cause instanceof Error ? cause.stack : String(cause));
            if (await errorPage(500)) return;
            inertiaHttpAdapter.setStatus(res, 500);
            inertiaHttpAdapter.json(res, { statusCode: 500, message: 'Internal server error' });
            return;
        }

        const status = exception.getStatus();
        const codes = (req as Record<string, unknown>).inertiaHandleExceptionCodes as number[] | 'all' | undefined;

        if (!codes || (codes !== 'all' && !codes.includes(status))) {
            if (await errorPage(status)) return;
            const body = exception.getResponse();
            inertiaHttpAdapter.setStatus(res, status);
            inertiaHttpAdapter.json(res, typeof body === 'string' ? { statusCode: status, message: body } : body);
            return;
        }

        const errors = normalizeToErrors(exception.getResponse());
        const isInertia = !!inertiaHttpAdapter.getHeader(req, INERTIA_HEADER);

        if (isInertia) {
            const returnPath = returnPathFor(req, status);
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

        // A plain browser request (first visit, bookmark, form without JS): send it
        // where an Inertia visit would go, with the errors flashed. Clients that
        // explicitly ask for JSON (APIs, fetch) still get JSON.
        if (!wantsJson(inertiaHttpAdapter.getHeader(req, 'accept'))) {
            const returnPath = returnPathFor(req, status);
            this.inertia.redirectBack(req, res, errors as Record<string, string>, returnPath);
            return;
        }

        inertiaHttpAdapter.setStatus(res, status);
        inertiaHttpAdapter.json(res, exception.getResponse());
    }
}

/** True when the client asks for JSON and not HTML (e.g. `Accept: application/json`). */
function wantsJson(accept: string | undefined): boolean {
    return !!accept && /\bjson\b/i.test(accept) && !/text\/html/i.test(accept);
}

/**
 * The tagged returnPath, but only for the statuses of the
 * @InertiaHandleException that declared it; anything else redirects back.
 */
function returnPathFor(req: HttpRequestLike, status: number): string | undefined {
    const tags = req as Record<string, unknown>;
    const path = tags.inertiaReturnPath as string | undefined;
    const codes = tags.inertiaReturnPathCodes as 'all' | number[] | undefined;
    if (!path) return undefined;
    // Untagged codes: set by something other than the guard (keep old behaviour).
    if (codes === undefined || codes === 'all' || codes.includes(status)) return path;
    return undefined;
}
