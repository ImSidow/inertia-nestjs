export interface HttpRequestLike {
    headers?: Record<string, unknown>;
    method?: string;
    url?: string;
    originalUrl?: string;
    [key: string]: unknown;
}

export interface HttpResponseLike {
    app?: {
        render?: (
            view: string,
            options?: Record<string, unknown>,
            callback?: (err: Error | null, html?: string) => void,
        ) => void;
    };
    status?(code: number): this;
    code?(code: number): this;
    setHeader?(name: string, value: string): this | void;
    header?(name: string, value: string): this | void;
    getHeader?(name: string): unknown;
    json?(body: unknown): this | void;
    send?(body?: unknown): this | void;
    render?(
        view: string,
        locals?: Record<string, unknown>,
        callback?: (err: Error | null, html?: string) => void,
    ): this | void;
    redirect?(statusOrUrl: number | string, url?: string): this | void;
    end?(): this | void;
    [key: string]: unknown;
}

export type NextFunctionLike = (...args: unknown[]) => void;
