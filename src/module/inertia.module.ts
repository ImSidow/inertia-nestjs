import {
    DynamicModule,
    FactoryProvider,
    Module,
    ModuleMetadata,
    Provider,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { InertiaModuleOptions } from '../common/inertia.interfaces';
import { InertiaInterceptor } from '../interceptors/inertia.interceptor';
import { InertiaComponentInterceptor } from '../interceptors/inertia-component.interceptor';
import { InertiaHandleExceptionInterceptor } from '../interceptors/inertia-handle-exception.interceptor';
import { HandleInertiaRequests } from '../middleware/handle-inertia-requests.middleware';
import { InertiaResponseHandledFilter } from '../common/inertia-response-handled.filter';
import { InertiaValidationFilter } from '../filters/inertia-validation.filter';
import { InertiaService } from '../services/inertia.service';
import { HttpGateway } from '../ssr/http-gateway';
import { SSR_GATEWAY, SsrGateway } from '../ssr/ssr-gateway.interface';

export const INERTIA_MODULE_OPTIONS = 'INERTIA_MODULE_OPTIONS';

export interface InertiaModuleAsyncOptions extends Pick<
    ModuleMetadata,
    'imports'
> {
    useFactory: (
        ...args: unknown[]
    ) => Promise<InertiaModuleOptions> | InertiaModuleOptions;
    inject?: FactoryProvider['inject'];
}

function buildSsrProvider(options: InertiaModuleOptions): Provider | null {
    if (!options.ssr) return null;

    return {
        provide: SSR_GATEWAY,
        useFactory: () => new HttpGateway(options.ssr!),
    };
}

@Module({})
export class InertiaModule {
    static forRoot(options: InertiaModuleOptions = {}): DynamicModule {
        const ssrProvider = buildSsrProvider(options);

        const providers: Provider[] = [
            Reflector,
            {
                provide: INERTIA_MODULE_OPTIONS,
                useValue: options,
            },
            ...(ssrProvider ? [ssrProvider] : []),
            {
                provide: InertiaService,
                useFactory: (
                    opts: InertiaModuleOptions,
                    gateway?: SsrGateway,
                ) => new InertiaService(opts, gateway),
                inject: [
                    INERTIA_MODULE_OPTIONS,
                    ...(ssrProvider ? [SSR_GATEWAY] : []),
                ],
            },
            {
                provide: InertiaInterceptor,
                useFactory: (inertia: InertiaService, reflector: Reflector) =>
                    new InertiaInterceptor(inertia, reflector),
                inject: [InertiaService, Reflector],
            },
            {
                provide: APP_INTERCEPTOR,
                useExisting: InertiaInterceptor,
            },
            {
                provide: APP_FILTER,
                useClass: InertiaResponseHandledFilter,
            },
            {
                provide: InertiaComponentInterceptor,
                useFactory: (reflector: Reflector) => new InertiaComponentInterceptor(reflector),
                inject: [Reflector],
            },
            {
                provide: APP_INTERCEPTOR,
                useExisting: InertiaComponentInterceptor,
            },
            {
                provide: InertiaHandleExceptionInterceptor,
                useFactory: (reflector: Reflector) => new InertiaHandleExceptionInterceptor(reflector),
                inject: [Reflector],
            },
            {
                provide: APP_INTERCEPTOR,
                useExisting: InertiaHandleExceptionInterceptor,
            },
            {
                provide: InertiaValidationFilter,
                useFactory: (inertia: InertiaService) => new InertiaValidationFilter(inertia),
                inject: [InertiaService],
            },
            HandleInertiaRequests,
        ];

        return {
            module: InertiaModule,
            global: true,
            providers,
            exports: [
                Reflector,
                InertiaService,
                InertiaInterceptor,
                InertiaComponentInterceptor,
                InertiaHandleExceptionInterceptor,
                InertiaValidationFilter,
                HandleInertiaRequests,
                ...(ssrProvider ? [SSR_GATEWAY] : []),
            ],
        };
    }

    static forRootAsync(options: InertiaModuleAsyncOptions): DynamicModule {
        const providers: Provider[] = [
            Reflector,
            {
                provide: INERTIA_MODULE_OPTIONS,
                useFactory: options.useFactory,
                inject: options.inject ?? [],
            },
            {
                provide: SSR_GATEWAY,
                useFactory: (opts: InertiaModuleOptions) =>
                    opts.ssr ? new HttpGateway(opts.ssr) : null,
                inject: [INERTIA_MODULE_OPTIONS],
            },
            {
                provide: InertiaService,
                useFactory: (
                    opts: InertiaModuleOptions,
                    gateway: SsrGateway | null,
                ) => new InertiaService(opts, gateway ?? undefined),
                inject: [INERTIA_MODULE_OPTIONS, SSR_GATEWAY],
            },
            {
                provide: InertiaInterceptor,
                useFactory: (inertia: InertiaService, reflector: Reflector) =>
                    new InertiaInterceptor(inertia, reflector),
                inject: [InertiaService, Reflector],
            },
            {
                provide: APP_INTERCEPTOR,
                useExisting: InertiaInterceptor,
            },
            {
                provide: APP_FILTER,
                useClass: InertiaResponseHandledFilter,
            },
            {
                provide: InertiaComponentInterceptor,
                useFactory: (reflector: Reflector) => new InertiaComponentInterceptor(reflector),
                inject: [Reflector],
            },
            {
                provide: APP_INTERCEPTOR,
                useExisting: InertiaComponentInterceptor,
            },
            {
                provide: InertiaHandleExceptionInterceptor,
                useFactory: (reflector: Reflector) => new InertiaHandleExceptionInterceptor(reflector),
                inject: [Reflector],
            },
            {
                provide: APP_INTERCEPTOR,
                useExisting: InertiaHandleExceptionInterceptor,
            },
            {
                provide: InertiaValidationFilter,
                useFactory: (inertia: InertiaService) => new InertiaValidationFilter(inertia),
                inject: [InertiaService],
            },
            HandleInertiaRequests,
        ];

        return {
            module: InertiaModule,
            global: true,
            imports: options.imports ?? [],
            providers,
            exports: [
                Reflector,
                InertiaService,
                InertiaInterceptor,
                InertiaComponentInterceptor,
                InertiaHandleExceptionInterceptor,
                InertiaValidationFilter,
                HandleInertiaRequests,
                SSR_GATEWAY,
            ],
        };
    }
}
