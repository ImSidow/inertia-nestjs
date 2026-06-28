import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { INERTIA_VALIDATE_KEY } from '../decorators/inertia-validate.decorator';
import { HttpRequestLike } from '../adapters';

@Injectable()
export class InertiaComponentInterceptor implements NestInterceptor {
    constructor(private readonly reflector: Reflector) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const component = this.reflector.get<string | undefined>(INERTIA_VALIDATE_KEY, context.getHandler());

        if (component !== undefined) {
            const req = context.switchToHttp().getRequest<HttpRequestLike & { inertiaValidateComponent?: string }>();
            req.inertiaValidateComponent = component;
        }

        return next.handle();
    }
}
