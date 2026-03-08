import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { InertiaResponse } from '../common/inertia-response';

@Injectable()
export class InertiaResponseInterceptor implements NestInterceptor {
    intercept(
        _context: ExecutionContext,
        next: CallHandler,
    ): Observable<unknown> {
        return next.handle().pipe(
            map((value) => {
                if (value instanceof InertiaResponse) {
                    return undefined;
                }

                return value;
            }),
        );
    }
}
