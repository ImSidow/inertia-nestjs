import { HttpRequestLike, HttpResponseLike } from './http-types';

export interface CookieOptions {
    httpOnly?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
    maxAge?: number;
    path?: string;
    secure?: boolean;
}

export interface InertiaHttpAdapter {
    getHeader(req: HttpRequestLike, name: string): string | undefined;
    getRequestMethod(req: HttpRequestLike): string;
    getRequestUrl(req: HttpRequestLike): string;

    /**
     * The underlying Node request/response. Fastify wraps it in `.raw` (and Nest
     * middleware only sees the raw one), so per-request state is stored there.
     */
    raw(target: object): Record<string, any>;
    /**
     * The Referer when it points at this site (a path, or the request's own
     * Host / X-Forwarded-Host); otherwise undefined, so "redirect back" can
     * never send the browser to another site.
     */
    sameOriginReferer(req: HttpRequestLike): string | undefined;
    setHeader(res: HttpResponseLike, name: string, value: string | string[]): void;
    appendVary(res: HttpResponseLike, value: string): void;
    getHeaderFromResponse(
        res: HttpResponseLike,
        name: string,
    ): string | undefined;

    setStatus(res: HttpResponseLike, code: number): void;
    json(res: HttpResponseLike, body: unknown): void;

    render(
        res: HttpResponseLike,
        view: string,
        locals: Record<string, unknown>,
    ): void;

    renderAsync(
        res: HttpResponseLike,
        view: string,
        locals: Record<string, unknown>,
    ): Promise<void>;

    redirect(res: HttpResponseLike, status: number, url: string): void;
    end(res: HttpResponseLike): void;
    setCookie(res: HttpResponseLike, name: string, value: string, options?: CookieOptions): void;
}
