import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EMPTY, Observable, of, switchMap } from 'rxjs';
import { INERTIA_HANDLE_EXCEPTION_KEY } from '../common/inertia.constants';
import { INERTIA_VALIDATE_KEY } from '../decorators/inertia-validate.decorator';
import { InertiaHandleExceptionOptions } from '../decorators/inertia-handle-exception.decorator';
import { HttpRequestLike, HttpResponseLike, inertiaHttpAdapter } from '../adapters';

@Injectable()
export class InertiaHandleExceptionInterceptor implements NestInterceptor {
    constructor(private readonly reflector: Reflector) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const handleMeta = this.reflector.get<InertiaHandleExceptionOptions | undefined>(
            INERTIA_HANDLE_EXCEPTION_KEY,
            context.getHandler(),
        );
        const validateKey = this.reflector.get<string | undefined>(INERTIA_VALIDATE_KEY, context.getHandler());

        const hasHandleDecorator = handleMeta !== undefined;
        const hasValidateDecorator = validateKey !== undefined;

        if (!hasHandleDecorator && !hasValidateDecorator) return next.handle();

        // undefined codes = catch all; explicit array = specific codes only
        const catchAll = hasHandleDecorator && handleMeta!.codes === undefined;
        const specificCodes = new Set<number>();
        if (!catchAll && hasHandleDecorator) handleMeta!.codes!.forEach(c => specificCodes.add(c));
        if (hasValidateDecorator) specificCodes.add(400);

        const req = context.switchToHttp().getRequest<HttpRequestLike>();
        const res = context.switchToHttp().getResponse<HttpResponseLike>();

        (req as Record<string, unknown>).inertiaHandleExceptionCodes = catchAll ? 'all' : [...specificCodes];

        if (handleMeta?.returnPath) {
            (req as Record<string, unknown>).inertiaReturnPath = handleMeta.returnPath;
        }

        return next.handle().pipe(
            switchMap((value) => {
                if (!(res as { headersSent?: boolean }).headersSent) {
                    const returnPath = handleMeta?.returnPath
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
