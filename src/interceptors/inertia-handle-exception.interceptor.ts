import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EMPTY, Observable, of, switchMap } from 'rxjs';
import { resolveInertiaHandleExceptionCodes } from '../common/resolve-inertia-handle-exception-codes';
import { INERTIA_COMPONENT_KEY, INERTIA_HANDLE_EXCEPTION_KEY } from '../common/inertia.constants';
import { InertiaHandleExceptionOptions } from '../decorators/inertia-handle-exception.decorator';
import { HttpRequestLike, HttpResponseLike, inertiaHttpAdapter } from '../adapters';

/**
 * Nest's @Redirect() metadata key. NestJS 12 no longer exports its constants
 * module, so the (stable since Nest 6) value is used directly.
 */
const NEST_REDIRECT_METADATA = '__redirect__';

/**
 * Success path of @InertiaHandleException() / @InertiaValidate(): when the
 * handler did not decide how to respond, redirect back (303) the way a form
 * submit expects. A handler that renders an Inertia page, uses @Redirect(),
 * or already sent a response keeps control; errors go to InertiaValidationFilter.
 */
@Injectable()
export class InertiaHandleExceptionInterceptor implements NestInterceptor {
    constructor(private readonly reflector: Reflector) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const handler = context.getHandler();
        const { codes } = resolveInertiaHandleExceptionCodes(this.reflector, handler, context.getClass());

        if (codes === undefined) return next.handle();

        // On success only the route's own returnPath counts: a class-level
        // `{ codes: [401], returnPath: '/login' }` is about errors, not where a
        // successful form goes.
        const configuredReturnPath = this.reflector.get<InertiaHandleExceptionOptions | undefined>(
            INERTIA_HANDLE_EXCEPTION_KEY,
            handler,
        )?.returnPath;

        // The handler decides: @Redirect() is applied by Nest after this
        // interceptor, and an @Inertia() page renders itself.
        const decidesItself =
            this.reflector.get(NEST_REDIRECT_METADATA, handler) !== undefined ||
            this.reflector.get(INERTIA_COMPONENT_KEY, handler) !== undefined;
        if (decidesItself) return next.handle();

        const req = context.switchToHttp().getRequest<HttpRequestLike>();
        const res = context.switchToHttp().getResponse<HttpResponseLike>();

        return next.handle().pipe(
            switchMap((value) => {
                // Fastify's reply has no headersSent; its raw Node response does.
                if (!inertiaHttpAdapter.raw(res).headersSent) {
                    const returnPath = configuredReturnPath ?? inertiaHttpAdapter.sameOriginReferer(req) ?? '/';
                    inertiaHttpAdapter.redirect(res, 303, returnPath);
                    return EMPTY;
                }
                return of(value);
            }),
        );
    }
}
