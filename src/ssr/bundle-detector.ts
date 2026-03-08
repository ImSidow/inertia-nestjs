import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Detects whether an SSR bundle file exists on disk.
 */
export class BundleDetector {
    private static readonly DEFAULT_PATHS = [
        'bootstrap/ssr/ssr.js',
        'bootstrap/ssr/ssr.mjs',
        'public/js/ssr.js',
    ];

    constructor(private readonly customPath?: string) {}

    detect(): boolean {
        if (this.customPath) {
            return existsSync(resolve(process.cwd(), this.customPath));
        }

        return BundleDetector.DEFAULT_PATHS.some((p) =>
            existsSync(resolve(process.cwd(), p)),
        );
    }

    resolvePath(): string | undefined {
        const paths = this.customPath
            ? [this.customPath]
            : BundleDetector.DEFAULT_PATHS;

        for (const p of paths) {
            const full = resolve(process.cwd(), p);
            if (existsSync(full)) return full;
        }

        return undefined;
    }
}
