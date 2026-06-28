import { SetMetadata } from '@nestjs/common';
import { INERTIA_HANDLE_EXCEPTION_KEY } from '../common/inertia.constants';

export interface InertiaHandleExceptionOptions {
    codes?: number[];
    returnPath?: string;
}

export const InertiaHandleException = (options: InertiaHandleExceptionOptions = {}) =>
    SetMetadata(INERTIA_HANDLE_EXCEPTION_KEY, {
        codes: options.codes,   // undefined = catch all HTTP exceptions
        returnPath: options.returnPath,
    });
