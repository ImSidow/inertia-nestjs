import { InertiaPage } from 'src/common/inertia.interfaces';
import {
    assertInertia,
    assertInertiaLocation,
    InertiaPageAssert,
} from '../src/testing';

const basePage: InertiaPage = {
    component: 'Users/Index',
    props: {
        users: [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
        ],
        count: 2,
        nested: { value: 42 },
    },
    url: '/users',
    version: '1.0.0',
};

describe('assertInertia()', () => {
    it('returns an InertiaPageAssert instance', () => {
        const assert = assertInertia(basePage);
        expect(assert).toBeInstanceOf(InertiaPageAssert);
    });

    it('passes component assertion', () => {
        expect(() =>
            assertInertia(basePage, (p) => p.component('Users/Index')),
        ).not.toThrow();
    });

    it('fails component assertion with wrong name', () => {
        expect(() =>
            assertInertia(basePage, (p) => p.component('Wrong')),
        ).toThrow(/component/);
    });

    it('passes has() for existing prop', () => {
        expect(() =>
            assertInertia(basePage, (p) => p.has('count')),
        ).not.toThrow();
    });

    it('fails has() for missing prop', () => {
        expect(() =>
            assertInertia(basePage, (p) => p.has('nonexistent')),
        ).toThrow(/nonexistent/);
    });

    it('passes where() with correct value', () => {
        expect(() =>
            assertInertia(basePage, (p) => p.where('count', 2)),
        ).not.toThrow();
    });

    it('fails where() with wrong value', () => {
        expect(() =>
            assertInertia(basePage, (p) => p.where('count', 99)),
        ).toThrow();
    });

    it('passes missing() for absent prop', () => {
        expect(() =>
            assertInertia(basePage, (p) => p.missing('ghost')),
        ).not.toThrow();
    });

    it('fails missing() for existing prop', () => {
        expect(() =>
            assertInertia(basePage, (p) => p.missing('count')),
        ).toThrow(/count/);
    });

    it('resolves dot notation', () => {
        expect(() =>
            assertInertia(basePage, (p) => p.where('nested.value', 42)),
        ).not.toThrow();
    });

    it('resolves array index notation', () => {
        expect(() =>
            assertInertia(basePage, (p) => p.where('users[0].name', 'Alice')),
        ).not.toThrow();
    });

    it('throws on non-Inertia response body', () => {
        expect(() => assertInertia({ foo: 'bar' })).toThrow(/component/);
    });
});

describe('assertInertiaLocation()', () => {
    it('passes with matching URL', () => {
        expect(() =>
            assertInertiaLocation(
                { 'x-inertia-location': 'https://example.com' },
                'https://example.com',
            ),
        ).not.toThrow();
    });

    it('fails with wrong URL', () => {
        expect(() =>
            assertInertiaLocation(
                { 'x-inertia-location': 'https://other.com' },
                'https://example.com',
            ),
        ).toThrow(/example.com/);
    });

    it('fails when header is missing', () => {
        expect(() => assertInertiaLocation({}, 'https://example.com')).toThrow(
            /X-Inertia-Location/,
        );
    });
});
