import { InertiaPage, InertiaProps } from '../common/inertia.interfaces';

type AssertCallback = (assert: InertiaPageAssert) => void;

/**
 * Test assertion helper for Inertia responses.
 *
 * Mirrors Laravel's `AssertableInertia` / `InertiaTestingResponse`.
 *
 * Usage with supertest:
 *
 * ```ts
 * const res = await request(app.getHttpServer()).get('/users');
 * assertInertia(res.body, (page) => {
 *   page
 *     .component('Users/Index')
 *     .has('users')
 *     .where('users[0].name', 'Alice');
 * });
 * ```
 */
export class InertiaPageAssert {
    constructor(private readonly page: InertiaPage) {}

    /**
     * Assert the Inertia component name.
     *
     * Equivalent to `->component('SomePage')` in Laravel.
     */
    component(expected: string): this {
        if (this.page.component !== expected) {
            throw new Error(
                `Expected Inertia component "${expected}" but got "${this.page.component}".`,
            );
        }
        return this;
    }

    /**
     * Assert a prop exists (optionally asserting its value).
     *
     * Equivalent to `->has('propName')` or `->has('propName', value)` in Laravel.
     */
    has(key: string, value?: unknown): this {
        const actual = this.resolveDotPath(this.page.props, key);

        if (actual === undefined) {
            throw new Error(
                `Expected prop "${key}" to exist in Inertia props.`,
            );
        }

        if (value !== undefined) {
            const actualStr = JSON.stringify(actual);
            const expectedStr = JSON.stringify(value);
            if (actualStr !== expectedStr) {
                throw new Error(
                    `Expected prop "${key}" to equal ${expectedStr} but got ${actualStr}.`,
                );
            }
        }

        return this;
    }

    /**
     * Assert a prop is missing.
     *
     * Equivalent to `->missing('propName')` in Laravel.
     */
    missing(key: string): this {
        const actual = this.resolveDotPath(this.page.props, key);
        if (actual !== undefined) {
            throw new Error(
                `Expected prop "${key}" to be missing but it exists.`,
            );
        }
        return this;
    }

    /**
     * Assert a prop equals an expected value.
     *
     * Equivalent to `->where('key', value)` in Laravel.
     */
    where(key: string, expected: unknown): this {
        return this.has(key, expected);
    }

    /**
     * Assert the URL of the Inertia page.
     */
    url(expected: string): this {
        if (this.page.url !== expected) {
            throw new Error(
                `Expected Inertia URL "${expected}" but got "${this.page.url}".`,
            );
        }
        return this;
    }

    /**
     * Assert the Inertia asset version.
     */
    version(expected: string): this {
        if (this.page.version !== expected) {
            throw new Error(
                `Expected Inertia version "${expected}" but got "${this.page.version}".`,
            );
        }
        return this;
    }

    /**
     * Assert that encryptHistory is set.
     */
    encryptHistory(expected = true): this {
        if (this.page.encryptHistory !== expected) {
            throw new Error(
                `Expected encryptHistory to be ${expected} but got ${this.page.encryptHistory}.`,
            );
        }
        return this;
    }

    /**
     * Assert that clearHistory is set.
     */
    clearHistory(expected = true): this {
        if (this.page.clearHistory !== expected) {
            throw new Error(
                `Expected clearHistory to be ${expected} but got ${this.page.clearHistory}.`,
            );
        }
        return this;
    }

    /**
     * Access raw props for custom assertions.
     */
    get props(): InertiaProps {
        return this.page.props;
    }

    private resolveDotPath(obj: unknown, path: string): unknown {
        return path.split('.').reduce<unknown>((acc, key) => {
            if (acc === undefined || acc === null) return undefined;
            if (typeof acc !== 'object') return undefined;

            // Support array index notation: users[0]
            const arrMatch = key.match(/^(\w+)\[(\d+)\]$/);
            if (arrMatch) {
                const [, prop, index] = arrMatch;
                const arr = (acc as Record<string, unknown[]>)[prop];
                return Array.isArray(arr)
                    ? arr[parseInt(index, 10)]
                    : undefined;
            }

            return (acc as Record<string, unknown>)[key];
        }, obj);
    }
}

/**
 * Assert an Inertia response body.
 *
 * @param body     - Response body (parsed JSON from supertest or similar)
 * @param callback - Assertion callback
 *
 * @example
 * assertInertia(res.body, (page) => {
 *   page.component('Users/Index').has('users');
 * });
 */
export function assertInertia(
    body: unknown,
    callback?: AssertCallback,
): InertiaPageAssert {
    const page = body as InertiaPage;

    if (!page || typeof page !== 'object') {
        throw new Error('Response body is not a valid Inertia page object.');
    }

    if (!page.component) {
        throw new Error(
            'Response body does not contain an Inertia "component" field. ' +
                'Make sure you send the X-Inertia header in your test request.',
        );
    }

    const assert = new InertiaPageAssert(page);

    if (callback) {
        callback(assert);
    }

    return assert;
}

/**
 * Assert an Inertia location response (external redirect / 409).
 */
export function assertInertiaLocation(
    headers: Record<string, string | string[] | undefined>,
    expectedUrl: string,
): void {
    const location = headers['x-inertia-location'];
    if (!location) {
        throw new Error('Expected X-Inertia-Location header to be set.');
    }
    const actual = Array.isArray(location) ? location[0] : location;
    if (actual !== expectedUrl) {
        throw new Error(
            `Expected X-Inertia-Location "${expectedUrl}" but got "${actual}".`,
        );
    }
}
