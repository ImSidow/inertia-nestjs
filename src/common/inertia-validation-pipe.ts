import {
    BadRequestException,
    ValidationError,
    ValidationPipe,
    ValidationPipeOptions,
} from '@nestjs/common';

/**
 * class-validator errors → `{ errors: { field: message } }`, the shape
 * InertiaValidationFilter flashes and `useForm().errors` reads. Nested DTOs
 * use dot paths (`address.city`, `items.0.name`); each field keeps its first
 * message, like inertia-laravel.
 *
 * Nest's default ValidationPipe keeps only the messages, not which field they
 * belong to, so they can't be shown next to the inputs.
 */
export function inertiaExceptionFactory(errors: ValidationError[]): BadRequestException {
    const fields: Record<string, string> = {};
    const collect = (list: ValidationError[], prefix: string) => {
        for (const error of list) {
            const path = prefix ? `${prefix}.${error.property}` : error.property;
            const first = Object.values(error.constraints ?? {})[0];
            if (first && !(path in fields)) fields[path] = first;
            if (error.children?.length) collect(error.children, path);
        }
    };
    collect(errors, '');
    return new BadRequestException({ errors: fields });
}

/**
 * A ValidationPipe whose errors are keyed by field for Inertia forms.
 *
 * @example app.useGlobalPipes(new InertiaValidationPipe({ whitelist: true }));
 */
export class InertiaValidationPipe extends ValidationPipe {
    constructor(options: ValidationPipeOptions = {}) {
        super({ ...options, exceptionFactory: options.exceptionFactory ?? inertiaExceptionFactory });
    }
}
