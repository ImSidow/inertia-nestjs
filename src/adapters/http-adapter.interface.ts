import { HttpRequestLike, HttpResponseLike } from './http-types';

export interface InertiaHttpAdapter {
    getHeader(req: HttpRequestLike, name: string): string | undefined;
    getRequestMethod(req: HttpRequestLike): string;
    getRequestUrl(req: HttpRequestLike): string;

    setHeader(res: HttpResponseLike, name: string, value: string): void;
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
}
