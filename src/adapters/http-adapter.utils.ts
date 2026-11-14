import { CookieOptions, InertiaHttpAdapter } from './http-adapter.interface';
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
        const method = String(req.method ?? 'GET').toUpperCase();
        if (method !== 'GET') {
            const referer = asRecord(req.headers)['referer'];
            if (referer) {
                try { return new URL(String(referer)).pathname; } catch {}
            }
        }
        return String(req.originalUrl ?? req.url ?? '/');
    },

    sameOriginReferer(req: HttpRequestLike): string | undefined {
        const referer = this.getHeader(req, 'referer');
        if (!referer) return undefined;
        // A path on this site ("/posts/1"), but not a protocol-relative URL ("//evil.test").
        if (referer.startsWith('/') && !referer.startsWith('//')) return referer;
        try {
            const host = new URL(referer).host;
            const ours = [this.getHeader(req, 'host'), this.getHeader(req, 'x-forwarded-host')];
            return ours.includes(host) ? referer : undefined;
        } catch {
            return undefined;
        }
    },

    raw(target: object): Record<string, any> {
        return ((target as { raw?: object }).raw ?? target) as Record<string, any>;
    },

    setHeader(res: HttpResponseLike, name: string, value: string | string[]): void {
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

    /** Add `value` to the response's Vary header, keeping existing values. */
    appendVary(res: HttpResponseLike, value: string): void {
        const vary = this.getHeaderFromResponse(res, 'Vary');
        if (!vary) {
            this.setHeader(res, 'Vary', value);
            return;
        }
        const values = vary.split(',').map((v) => v.trim().toLowerCase());
        if (values.includes(value.toLowerCase()) || values.includes('*')) return;
        this.setHeader(res, 'Vary', `${vary}, ${value}`);
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
        const responseState = this.raw(res);

        if (responseState.headersSent) {
            return;
        }

        // Fastify with @fastify/view: viewAsync() renders to a string.
        const reply = res as HttpResponseLike & {
            viewAsync?: (view: string, locals: Record<string, unknown>) => Promise<string>;
        };
        if (typeof reply.viewAsync === 'function') {
            const html = await reply.viewAsync(view, locals);
            if (responseState.headersSent) return;
            this.setHeader(res, 'Content-Type', 'text/html; charset=utf-8');
            res.send!(html);
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
            'Response object does not support render(). Make sure a view engine is configured ' +
                '(Express: app.setViewEngine(); Fastify: @fastify/view via app.setViewEngine()).',
        );
    },

    redirect(res: HttpResponseLike, status: number, url: string): void {
        // Fastify's reply.redirect takes (url, code) in v5 and (code, url) in v4;
        // both honour a status set with code() first.
        if ('raw' in res && typeof res.code === 'function' && typeof res.redirect === 'function') {
            res.code(status);
            (res.redirect as (url: string) => void)(url);
            return;
        }

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

    setCookie(res: HttpResponseLike, name: string, value: string, options: CookieOptions = {}): void {
        const parts: string[] = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
        if (options.httpOnly) parts.push('HttpOnly');
        if (options.sameSite) {
            const s = options.sameSite;
            parts.push(`SameSite=${s[0].toUpperCase() + s.slice(1)}`);
        }
        if (options.maxAge != null) parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
        if (options.path) parts.push(`Path=${options.path}`);
        if (options.secure) parts.push('Secure');
        const cookie = parts.join('; ');

        // Append, so cookies set earlier in this response (session, auth) survive.
        // An earlier cookie with the same name is replaced, so the last write wins.
        const prefix = `${encodeURIComponent(name)}=`;
        const existing = typeof res.getHeader === 'function' ? res.getHeader('Set-Cookie') : undefined;
        const kept = ([] as unknown[])
            .concat(existing ?? [])
            .map(String)
            .filter((c) => !c.startsWith(prefix));
        this.setHeader(res, 'Set-Cookie', kept.length ? [...kept, cookie] : cookie);
    },
};
