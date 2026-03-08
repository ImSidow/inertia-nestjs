import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { InertiaResponseHandledException } from './inertia-response-handled.exception';

@Catch(InertiaResponseHandledException)
export class InertiaResponseHandledFilter implements ExceptionFilter {
    catch(_: InertiaResponseHandledException, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<{
            headersSent?: boolean;
            writableEnded?: boolean;
            end?: () => void;
        }>();

        if (response?.headersSent || response?.writableEnded) {
            return;
        }

        response?.end?.();
    }
}
