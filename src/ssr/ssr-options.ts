/**
 * SSR configuration options.
 *
 * Passed into `InertiaModule.forRoot({ ssr: { ... } })`.
 */
export interface SsrOptions {
    /**
     * Enable or disable SSR. Defaults to `true` when this object is provided.
     */
    enabled?: boolean;

    /**
     * URL of the running SSR Node.js server.
     * Defaults to `http://127.0.0.1:13714`.
     *
     * The `/render` path is automatically appended — you can pass the base URL
     * or the full `/render` URL; either is normalised correctly.
     */
    url?: string;

    /**
     * Absolute or cwd-relative path to the SSR bundle file.
     */
    bundlePath?: string;

    /**
     * Milliseconds before an SSR request times out and falls back to CSR.
     * Defaults to 5000 ms.
     */
    timeout?: number;
}
