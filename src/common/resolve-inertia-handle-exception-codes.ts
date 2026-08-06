import { Reflector } from '@nestjs/core';
import { INERTIA_HANDLE_EXCEPTION_KEY } from './inertia.constants';
import { INERTIA_VALIDATE_KEY } from '../decorators/inertia-validate.decorator';
import { InertiaHandleExceptionOptions } from '../decorators/inertia-handle-exception.decorator';

export interface ResolvedInertiaHandleExceptionCodes {
    /** undefined = neither @InertiaHandleException nor @InertiaValidate present on this handler */
    codes: 'all' | number[] | undefined;
    returnPath?: string;
}

export function resolveInertiaHandleExceptionCodes(
    reflector: Reflector,
    handler: Function, // matches ExecutionContext#getHandler()'s return type
): ResolvedInertiaHandleExceptionCodes {
    const handleMeta = reflector.get<InertiaHandleExceptionOptions | undefined>(
        INERTIA_HANDLE_EXCEPTION_KEY,
        handler,
    );
    const validateKey = reflector.get<string | undefined>(INERTIA_VALIDATE_KEY, handler);

    const hasHandleDecorator = handleMeta !== undefined;
    const hasValidateDecorator = validateKey !== undefined;

    if (!hasHandleDecorator && !hasValidateDecorator) return { codes: undefined };

    // undefined codes = catch all; explicit array = specific codes only
    const catchAll = hasHandleDecorator && handleMeta!.codes === undefined;
    const specificCodes = new Set<number>();
    if (!catchAll && hasHandleDecorator) handleMeta!.codes!.forEach(c => specificCodes.add(c));
    if (hasValidateDecorator) specificCodes.add(400);

    return {
        codes: catchAll ? 'all' : [...specificCodes],
        returnPath: handleMeta?.returnPath,
    };
}
