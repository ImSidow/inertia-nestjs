import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common';
import { INERTIA_COMPONENT_KEY } from '../common/inertia.constants';
import { InertiaInterceptor } from '../interceptors/inertia.interceptor';
import { RenderOptions } from '../common/inertia.interfaces';

/**
 * Mark a controller method as an Inertia responder.
 *
 * The handler should return an object `{ component, props?, ...options }`.
 * The interceptor will call `InertiaService.render()` automatically.
 *
 * @example
 * \@Get('/')
 * \@Inertia('Home/Index')
 * index() {
 *   return { greeting: 'Hello!' };
 * }
 *
 * // Or with full options:
 * \@Get('/dashboard')
 * \@Inertia('Dashboard', { encryptHistory: true })
 * dashboard() {
 *   return { stats: [] };
 * }
 */
export function Inertia(
    component: string,
    options: Omit<RenderOptions, 'props'> = {},
) {
    return applyDecorators(
        SetMetadata(INERTIA_COMPONENT_KEY, { component, options }),
        UseInterceptors(InertiaInterceptor),
    );
}

/**
 * Param decorator — inject the InertiaService into a controller method
 * so you can call render() manually (advanced use).
 *
 * Usage: see InertiaService docs.
 */
export { createParamDecorator, ExecutionContext } from '@nestjs/common';
