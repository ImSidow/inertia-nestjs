import { Reflector } from '@nestjs/core';
import { INERTIA_HANDLE_EXCEPTION_KEY } from './inertia.constants';
import { INERTIA_VALIDATE_KEY } from '../decorators/inertia-validate.decorator';
import { InertiaHandleExceptionOptions } from '../decorators/inertia-handle-exception.decorator';

export interface ResolvedInertiaHandleExceptionCodes {
    codes: 'all' | number[] | undefined;
    returnPath?: string;
    /**
     * The statuses returnPath applies to: those of the @InertiaHandleException
     * that set it. Others (e.g. 400 from @InertiaValidate) redirect back, so a
     * class-level `{ codes: [401], returnPath: '/login' }` never sends a form's
     * validation errors to /login.
     */
    returnPathCodes?: 'all' | number[];
}

/**
 * Reads @InertiaHandleException() / @InertiaValidate() from the route handler
 * and its controller class; the handler's own decorator wins.
 */
export function resolveInertiaHandleExceptionCodes(
    reflector: Reflector,
    handler: Function, // matches ExecutionContext#getHandler()'s return type
    controller?: Function, // ExecutionContext#getClass()
): ResolvedInertiaHandleExceptionCodes {
    const targets = controller ? [handler, controller] : [handler];
    const handleMeta = reflector.getAllAndOverride<InertiaHandleExceptionOptions | undefined>(
        INERTIA_HANDLE_EXCEPTION_KEY,
        targets,
    );
    const validateKey = reflector.getAllAndOverride<string | undefined>(INERTIA_VALIDATE_KEY, targets);

    const hasHandleDecorator = handleMeta !== undefined;
    const hasValidateDecorator = validateKey !== undefined;

    if (!hasHandleDecorator && !hasValidateDecorator) return { codes: undefined };

    // undefined codes = catch all; explicit array = specific codes only
    const catchAll = hasHandleDecorator && handleMeta!.codes === undefined;

    const specificCodes = new Set<number>();
    if (!catchAll && hasHandleDecorator) handleMeta!.codes!.forEach((c) => specificCodes.add(c));
    if (hasValidateDecorator) specificCodes.add(400);

    return {
        codes: catchAll ? 'all' : [...specificCodes],
        returnPath: handleMeta?.returnPath,
        returnPathCodes: hasHandleDecorator ? (catchAll ? 'all' : handleMeta!.codes) : undefined,
    };
}
