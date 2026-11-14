import type { HttpRequestLike, HttpResponseLike } from '../adapters';
import type { PropValue } from './inertia.interfaces';

/**
 * What `handleExceptionsUsing` receives for an error the app did not handle
 * itself. Return `error.render(component, props)` to answer with an Inertia
 * page (with the error's status code), or nothing to keep the default response.
 *
 * Equivalent to inertia-laravel's `ExceptionResponse`.
 */
export class InertiaExceptionResponse {
    /** Set by render(). */
    page?: { component: string; props: Record<string, PropValue> };

    constructor(
        /** The thrown error (an HttpException or anything else). */
        readonly exception: unknown,
        readonly request: HttpRequestLike,
        readonly response: HttpResponseLike,
        /** The status the response will have (500 for non-HTTP errors). */
        readonly statusCode: number,
    ) {}

    render(component: string, props: Record<string, PropValue> = {}): this {
        this.page = { component, props };
        return this;
    }
}

/**
 * @example
 * handleExceptionsUsing: (error) => {
 *     if ([403, 404, 500, 503].includes(error.statusCode)) {
 *         return error.render('error', { status: error.statusCode });
 *     }
 * }
 */
export type InertiaExceptionHandler = (
    error: InertiaExceptionResponse,
) => InertiaExceptionResponse | void | Promise<InertiaExceptionResponse | void>;
