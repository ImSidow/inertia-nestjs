import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, Injectable } from '@nestjs/common';
import { HttpRequestLike, HttpResponseLike } from '../adapters';
import { InertiaService } from '../services/inertia.service';

@Injectable()
@Catch(BadRequestException)
export class InertiaValidationFilter implements ExceptionFilter {
    constructor(private readonly inertia: InertiaService) {}

    async catch(exception: BadRequestException, host: ArgumentsHost): Promise<void> {
        const ctx = host.switchToHttp();
        const req = ctx.getRequest<HttpRequestLike & { inertiaValidateComponent?: string }>();
        const res = ctx.getResponse<HttpResponseLike>();

        const component = req.inertiaValidateComponent;

        if (!component) {
            const body = exception.getResponse();
            if (typeof res.status === 'function') {
                res.status(400);
            }
            if (typeof (res as { json?: (body: unknown) => void }).json === 'function') {
                (res as { json: (body: unknown) => void }).json(body);
            }
            return;
        }

        const body = exception.getResponse() as { errors?: Record<string, string> };

        await this.inertia.render(req, res, component, {
            props: { errors: body.errors ?? {} },
            status: 422,
        });
    }
}
