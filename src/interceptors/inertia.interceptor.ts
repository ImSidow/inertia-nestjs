import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, switchMap, throwError } from 'rxjs';
import { HttpRequestLike, HttpResponseLike } from '../adapters';
import { INERTIA_COMPONENT_KEY } from '../common/inertia.constants';
import { InertiaResponseHandledException } from '../common/inertia-response-handled.exception';
import { RenderOptions } from '../common/inertia.interfaces';
import { InertiaService } from '../services/inertia.service';

interface InertiaMetadata {
    component: string;
    options: Omit<RenderOptions, 'props'>;
}

/**
 * Interceptor that converts a controller handler's return value into an
 * Inertia page response.
 *
 * Automatically applied when you use the `@Inertia()` decorator.
 * You generally don't need to use this directly.
 */
@Injectable()
export class InertiaInterceptor implements NestInterceptor {
    constructor(
        private readonly inertia: InertiaService,
        private readonly reflector: Reflector,
    ) {}

    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<unknown> {
        const metadata = this.reflector.get<InertiaMetadata>(
            INERTIA_COMPONENT_KEY,
            context.getHandler(),
        );

        if (!metadata) {
            return next.handle();
        }

        const http = context.switchToHttp();
        const req = http.getRequest<HttpRequestLike>();
        const res = http.getResponse<HttpResponseLike>();

        return next.handle().pipe(
            switchMap((data: unknown) => {
                const props =
                    data && typeof data === 'object' && !Array.isArray(data)
                        ? (data as Record<string, unknown>)
                        : {};

                const renderOptions: RenderOptions = {
                    ...metadata.options,
                    props,
                };

                return from(
                    this.inertia.render(
                        req,
                        res,
                        metadata.component,
                        renderOptions,
                    ),
                ).pipe(
                    switchMap(() =>
                        throwError(() => new InertiaResponseHandledException()),
                    ),
                );
            }),
        );
    }
}
