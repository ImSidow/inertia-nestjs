import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EMPTY, Observable, of, switchMap } from 'rxjs';
import { resolveInertiaHandleExceptionCodes } from '../common/resolve-inertia-handle-exception-codes';
import { HttpRequestLike, HttpResponseLike, inertiaHttpAdapter } from '../adapters';

/**
 * Handles the success-path redirect for @InertiaHandleException()/@InertiaValidate() routes.
 * The failure-path tagging (which status codes to catch, and the return path) used to live
 * here too, but moved to InertiaExceptionTagGuard: a guard-thrown exception (e.g. from an
 * auth guard) skips interceptors entirely, so tagging done here never ran for that case.
 */
@Injectable()
export class InertiaHandleExceptionInterceptor implements NestInterceptor {
    constructor(private readonly reflector: Reflector) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const { codes, returnPath: configuredReturnPath } = resolveInertiaHandleExceptionCodes(
            this.reflector,
            context.getHandler(),
        );

        if (codes === undefined) return next.handle();

        const req = context.switchToHttp().getRequest<HttpRequestLike>();
        const res = context.switchToHttp().getResponse<HttpResponseLike>();

        return next.handle().pipe(
            switchMap((value) => {
                if (!(res as { headersSent?: boolean }).headersSent) {
                    const returnPath = configuredReturnPath
                        ?? inertiaHttpAdapter.getHeader(req, 'referer')
                        ?? '/';
                    inertiaHttpAdapter.redirect(res, 303, returnPath);
                    return EMPTY;
                }
                return of(value);
            }),
        );
    }
}
