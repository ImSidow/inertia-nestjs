import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { resolveInertiaHandleExceptionCodes } from '../common/resolve-inertia-handle-exception-codes';
import { HttpRequestLike } from '../adapters';

/**
 * Tags the request with which HTTP status codes @InertiaHandleException()/@InertiaValidate()
 * want caught, before any other guard runs. Registered globally (APP_GUARD), so it always
 * runs ahead of controller/method-level guards -- meaning the tag survives even when a later
 * guard (e.g. an auth guard) throws before the handler or InertiaHandleExceptionInterceptor
 * ever run. InertiaValidationFilter reads this tag to decide whether to flash-and-redirect.
 */
@Injectable()
export class InertiaExceptionTagGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const { codes, returnPath } = resolveInertiaHandleExceptionCodes(this.reflector, context.getHandler());
        if (codes === undefined) return true;

        const req = context.switchToHttp().getRequest<HttpRequestLike>();
        (req as Record<string, unknown>).inertiaHandleExceptionCodes = codes;
        if (returnPath) {
            (req as Record<string, unknown>).inertiaReturnPath = returnPath;
        }

        return true;
    }
}
