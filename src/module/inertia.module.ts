import {
    DynamicModule,
    FactoryProvider,
    Module,
    ModuleMetadata,
    Provider,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InertiaService } from '../services/inertia.service';
import { InertiaInterceptor } from '../interceptors/inertia.interceptor';
import { HandleInertiaRequests } from '../middleware/handle-inertia-requests.middleware';
import { InertiaModuleOptions } from '../common/inertia.interfaces';

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

/**
 * InertiaModule
 *
 * Register this module once in your root AppModule.
 *
 * @example
 * // Static configuration
 * \@Module({
 *   imports: [
 *     InertiaModule.forRoot({
 *       rootView: 'app',
 *       version: '1.0.0',
 *       sharedProps: {
 *         appName: 'My App',
 *       },
 *     }),
 *   ],
 * })
 * export class AppModule {}
 *
 * @example
 * // Async configuration
 * \@Module({
 *   imports: [
 *     InertiaModule.forRootAsync({
 *       imports: [ConfigModule],
 *       useFactory: (config: ConfigService) => ({
 *         version: config.get('ASSET_VERSION'),
 *       }),
 *       inject: [ConfigService],
 *     }),
 *   ],
 * })
 * export class AppModule {}
 */
@Module({})
export class InertiaModule {
    static forRoot(options: InertiaModuleOptions = {}): DynamicModule {
        const providers: Provider[] = [
            {
                provide: INERTIA_MODULE_OPTIONS,
                useValue: options,
            },
            {
                provide: InertiaService,
                useFactory: (opts: InertiaModuleOptions) =>
                    new InertiaService(opts),
                inject: [INERTIA_MODULE_OPTIONS],
            },
            {
                provide: InertiaInterceptor,
                useFactory: (inertia: InertiaService, reflector: Reflector) =>
                    new InertiaInterceptor(inertia, reflector),
                inject: [InertiaService, Reflector],
            },
            HandleInertiaRequests,
        ];

        return {
            module: InertiaModule,
            global: true,
            providers,
            exports: [
                InertiaService,
                InertiaInterceptor,
                HandleInertiaRequests,
            ],
        };
    }

    static forRootAsync(options: InertiaModuleAsyncOptions): DynamicModule {
        const providers: Provider[] = [
            {
                provide: INERTIA_MODULE_OPTIONS,
                useFactory: options.useFactory,
                inject: options.inject ?? [],
            },
            {
                provide: InertiaService,
                useFactory: (opts: InertiaModuleOptions) =>
                    new InertiaService(opts),
                inject: [INERTIA_MODULE_OPTIONS],
            },
            {
                provide: InertiaInterceptor,
                useFactory: (inertia: InertiaService, reflector: Reflector) =>
                    new InertiaInterceptor(inertia, reflector),
                inject: [InertiaService, Reflector],
            },
            HandleInertiaRequests,
        ];

        return {
            module: InertiaModule,
            global: true,
            imports: options.imports ?? [],
            providers,
            exports: [
                InertiaService,
                InertiaInterceptor,
                HandleInertiaRequests,
            ],
        };
    }
}
