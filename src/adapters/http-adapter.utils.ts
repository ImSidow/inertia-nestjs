import { InertiaHttpAdapter } from './http-adapter.interface';
import { HttpRequestLike, HttpResponseLike } from './http-types';

function normalizeHeaderName(name: string): string {
    return name.toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : {};
}

export const inertiaHttpAdapter: InertiaHttpAdapter = {
    getHeader(req: HttpRequestLike, name: string): string | undefined {
        const headers = asRecord(req.headers);
        const value = headers[normalizeHeaderName(name)] ?? headers[name];

        if (Array.isArray(value)) return String(value[0]);
        if (value == null) return undefined;
        return String(value);
    },

    getRequestMethod(req: HttpRequestLike): string {
        return String(req.method ?? 'GET').toUpperCase();
    },

    getRequestUrl(req: HttpRequestLike): string {
        return String(req.originalUrl ?? req.url ?? '/');
    },

    setHeader(res: HttpResponseLike, name: string, value: string): void {
        if (typeof res.header === 'function') {
            res.header(name, value);
            return;
        }

        if (typeof res.setHeader === 'function') {
            res.setHeader(name, value);
            return;
        }

        throw new Error(
            `Response object does not support setting header "${name}".`,
        );
    },

    getHeaderFromResponse(
        res: HttpResponseLike,
        name: string,
    ): string | undefined {
        if (typeof res.getHeader !== 'function') return undefined;

        const value = res.getHeader(name);
        if (Array.isArray(value)) return String(value[0]);
        if (value == null) return undefined;
        return String(value);
    },

    setStatus(res: HttpResponseLike, code: number): void {
        if (typeof res.status === 'function') {
            res.status(code);
            return;
        }

        if (typeof res.code === 'function') {
            res.code(code);
            return;
        }

        (res as Record<string, unknown>).statusCode = code;
    },

    json(res: HttpResponseLike, body: unknown): void {
        if (typeof res.json === 'function') {
            res.json(body);
            return;
        }

        if (typeof res.send === 'function') {
            res.send(body);
            return;
        }

        throw new Error('Response object does not support json/send.');
    },

    render(
        res: HttpResponseLike,
        view: string,
        locals: Record<string, unknown>,
    ): void {
        if (typeof res.render === 'function') {
            res.render(view, locals);
            return;
        }

        throw new Error(
            'Response object does not support render(). Make sure a view engine is configured.',
        );
    },

    async renderAsync(
        res: HttpResponseLike,
        view: string,
        locals: Record<string, unknown>,
    ): Promise<void> {
        const responseState = res as HttpResponseLike & {
            headersSent?: boolean;
        };

        if (responseState.headersSent) {
            return;
        }

        if (typeof res.send !== 'function') {
            throw new Error('Response object does not support send().');
        }

        if (res.app && typeof res.app.render === 'function') {
            await new Promise<void>((resolve, reject) => {
                res.app!.render!(view, locals, (err, html) => {
                    if (err) {
                        console.error('APP.RENDER ERROR:', err);
                        reject(err);
                        return;
                    }

                    if (responseState.headersSent) {
                        resolve();
                        return;
                    }

                    res.send!(html);
                    resolve();
                });
            });
            return;
        }

        if (typeof res.render === 'function') {
            await new Promise<void>((resolve, reject) => {
                res.render!(view, locals, (err, html) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    if (responseState.headersSent) {
                        resolve();
                        return;
                    }

                    res.send!(html);
                    resolve();
                });
            });
            return;
        }

        throw new Error(
            'Response object does not support render(). Make sure a view engine is configured.',
        );
    },

    redirect(res: HttpResponseLike, status: number, url: string): void {
        if (typeof res.redirect === 'function') {
            res.redirect(status, url);
            return;
        }

        this.setHeader(res, 'Location', url);
        this.setStatus(res, status);
        this.end(res);
    },

    end(res: HttpResponseLike): void {
        if (typeof res.end === 'function') {
            res.end();
            return;
        }

        if (typeof res.send === 'function') {
            res.send();
            return;
        }
    },
};
