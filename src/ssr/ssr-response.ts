/**
 * The response returned by the SSR rendering server.
 */
export interface SsrResponse {
    head: string[];
    body: string;
}
