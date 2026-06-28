import { inertiaHttpAdapter } from 'src/adapters/http-adapter.utils';

function makeRes() {
    const headers = new Map<string, string>();
    return {
        setHeader: jest.fn((name: string, value: string): void => { headers.set(name, value); }),
        getCookie: () => headers.get('Set-Cookie'),
    };
}

describe('inertiaHttpAdapter.setCookie()', () => {
    it('sets basic name=value', () => {
        const res = makeRes();
        inertiaHttpAdapter.setCookie(res, 'foo', 'bar');
        expect(res.getCookie()).toBe('foo=bar');
    });

    it('URL-encodes name and value', () => {
        const res = makeRes();
        inertiaHttpAdapter.setCookie(res, 'my cookie', 'hello world');
        expect(res.getCookie()).toBe('my%20cookie=hello%20world');
    });

    it('adds HttpOnly', () => {
        const res = makeRes();
        inertiaHttpAdapter.setCookie(res, 'x', 'y', { httpOnly: true });
        expect(res.getCookie()).toContain('HttpOnly');
    });

    it('capitalises SameSite value', () => {
        const res = makeRes();
        inertiaHttpAdapter.setCookie(res, 'x', 'y', { sameSite: 'lax' });
        expect(res.getCookie()).toContain('SameSite=Lax');
    });

    it('converts maxAge from ms to seconds', () => {
        const res = makeRes();
        inertiaHttpAdapter.setCookie(res, 'x', 'y', { maxAge: 10_000 });
        expect(res.getCookie()).toContain('Max-Age=10');
    });

    it('floors fractional maxAge seconds', () => {
        const res = makeRes();
        inertiaHttpAdapter.setCookie(res, 'x', 'y', { maxAge: 1500 });
        expect(res.getCookie()).toContain('Max-Age=1');
    });

    it('adds Path', () => {
        const res = makeRes();
        inertiaHttpAdapter.setCookie(res, 'x', 'y', { path: '/' });
        expect(res.getCookie()).toContain('Path=/');
    });

    it('adds Secure', () => {
        const res = makeRes();
        inertiaHttpAdapter.setCookie(res, 'x', 'y', { secure: true });
        expect(res.getCookie()).toContain('Secure');
    });

    it('clears cookie with Max-Age=0 and path', () => {
        const res = makeRes();
        inertiaHttpAdapter.setCookie(res, '__inertia_flash', '', { maxAge: 0, path: '/' });
        expect(res.getCookie()).toContain('Max-Age=0');
        expect(res.getCookie()).toContain('Path=/');
    });

    it('combines all options in correct order', () => {
        const res = makeRes();
        inertiaHttpAdapter.setCookie(res, 'sess', 'abc', {
            httpOnly: true,
            sameSite: 'strict',
            maxAge: 5000,
            path: '/',
            secure: true,
        });
        const cookie = res.getCookie()!;
        expect(cookie.startsWith('sess=abc')).toBe(true);
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('SameSite=Strict');
        expect(cookie).toContain('Max-Age=5');
        expect(cookie).toContain('Path=/');
        expect(cookie).toContain('Secure');
    });
});
