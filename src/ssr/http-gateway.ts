import { Injectable, Logger } from '@nestjs/common';
import { InertiaPage } from '../common/inertia.interfaces';
import { BundleDetector } from './bundle-detector';
import { SsrGateway } from './ssr-gateway.interface';
import { SsrOptions } from './ssr-options';
import { SsrResponse } from './ssr-response';

/**
 * HTTP-based SSR Gateway.
 */
@Injectable()
export class HttpGateway implements SsrGateway {
    private readonly logger = new Logger(HttpGateway.name);
    private readonly url: string;
    private readonly enabled: boolean;
    private readonly detector: BundleDetector;

    constructor(private readonly options: SsrOptions) {
        const base = (options.url ?? 'http://127.0.0.1:13714').replace(
            /\/render$/,
            '',
        );
        this.url = `${base}/render`;
        this.enabled = options.enabled ?? true;
        this.detector = new BundleDetector(options.bundlePath);
    }

    async dispatch(page: InertiaPage): Promise<SsrResponse | null> {
        if (!this.enabled) {
            return null;
        }

        if (!this.detector.detect()) {
            return null;
        }

        try {
            const response = await fetch(this.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify(page),
                signal: AbortSignal.timeout(this.options.timeout ?? 5000),
            });

            if (!response.ok) {
                this.logger.warn(
                    `SSR server responded with status ${response.status}. Falling back to CSR.`,
                );
                return null;
            }

            const data = (await response.json()) as Partial<SsrResponse>;

            if (!data || typeof data.body !== 'string') {
                this.logger.warn(
                    'SSR server returned an unexpected payload. Falling back to CSR.',
                );
                return null;
            }

            return {
                head: Array.isArray(data.head) ? data.head : [],
                body: data.body,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn(
                `SSR request failed (${message}). Falling back to CSR.`,
            );
            return null;
        }
    }
}
