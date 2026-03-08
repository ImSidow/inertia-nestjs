import { InertiaPage } from '../common/inertia.interfaces';
import { SsrResponse } from './ssr-response';

/**
 * SSR Gateway contract.
 */
export interface SsrGateway {
    /**
     * Dispatch the Inertia page object to the SSR server.
     *
     * Return `null` to fall back to client-side rendering.
     */
    dispatch(page: InertiaPage): Promise<SsrResponse | null>;
}

/** Injection token for the SSR Gateway */
export const SSR_GATEWAY = 'INERTIA_SSR_GATEWAY';
