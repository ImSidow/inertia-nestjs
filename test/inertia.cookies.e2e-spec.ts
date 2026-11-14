import { Controller, Get, MiddlewareConsumer, Module, NestModule, Post, Res } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HandleInertiaRequests, Inertia, InertiaModule, InertiaService } from '../src';

// The slice of Express's Response these handlers use (no @types/express here).
type Response = {
    cookie(name: string, value: string): void;
    redirect(status: number, url: string): void;
};

@Controller()
class TestController {
    constructor(private readonly inertia: InertiaService) {}

    // A session/auth library typically sets its cookie before the handler finishes.
    @Post('/login')
    login(@Res() res: Response) {
        res.cookie('sid', 'abc123');
        this.inertia.flash(res, { message: 'Welcome back' });
        res.redirect(303, '/');
    }

    @Get('/page')
    @Inertia('Page')
    page() {
        return {};
    }

    @Post('/invalid')
    invalid(@Res() res: Response) {
        res.cookie('sid', 'abc123');
        this.inertia.redirectBack({ headers: {} } as never, res, { email: 'Invalid' });
    }
}

@Module({
    imports: [InertiaModule.forRoot({ rootView: 'app', version: '1.0.0' })],
    controllers: [TestController],
})
class TestAppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(fakeCookieParser, HandleInertiaRequests).forRoutes('*');
    }
}

/** Stand-in for cookie-parser (decoded req.cookies), only when a test asks for it. */
function fakeCookieParser(req: any, _res: unknown, next: () => void) {
    if (req.headers['x-test-cookie-parser']) {
        req.cookies = Object.fromEntries(
            String(req.headers.cookie ?? '')
                .split(';')
                .map((p: string) => p.trim().split('='))
                .map(([k, v]: string[]) => [k, decodeURIComponent(v ?? '')]),
        );
    }
    next();
}

describe('Set-Cookie handling (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    const cookieNames = (res: request.Response) =>
        ([] as string[]).concat(res.headers['set-cookie'] ?? []).map((c) => c.split('=')[0]);

    it('flash() keeps cookies set earlier in the same response', async () => {
        const res = await request(app.getHttpServer()).post('/login').expect(303);
        expect(cookieNames(res)).toEqual(expect.arrayContaining(['sid', '__inertia_flash']));
    });

    it('redirectBack() with errors keeps cookies set earlier in the same response', async () => {
        const res = await request(app.getHttpServer()).post('/invalid').expect(303);
        expect(cookieNames(res)).toEqual(expect.arrayContaining(['sid', '__inertia_flash']));
    });

    it('clearing a consumed flash cookie keeps cookies the handler sets, with one flash cookie', async () => {
        const res = await request(app.getHttpServer())
            .post('/login')
            .set('Cookie', '__inertia_flash=%7B%22flash%22%3A%7B%7D%7D');
        // The middleware clears the old flash cookie, then the handler sets sid and a new flash.
        const names = cookieNames(res);
        expect(names).toEqual(expect.arrayContaining(['sid', '__inertia_flash']));
        expect(names.filter((n) => n === '__inertia_flash')).toHaveLength(1);
        expect(String(res.headers['set-cookie'])).not.toMatch(/__inertia_flash=;/); // the new value won
    });

    it('reads the flash cookie without cookie-parser installed', async () => {
        const flash = encodeURIComponent(JSON.stringify({ flash: { message: 'Saved' } }));
        const res = await request(app.getHttpServer())
            .get('/page')
            .set('X-Inertia', 'true')
            .set('X-Inertia-Version', '1.0.0')
            .set('Cookie', `other=1; __inertia_flash=${flash}`)
            .expect(200);
        expect(res.body.flash).toEqual({ message: 'Saved' });
    });

    it.each([
        ['without cookie-parser', {}],
        ['with cookie-parser (already decoded)', { 'X-Test-Cookie-Parser': '1' }],
    ])('keeps a flash message containing %% %s', async (_label, extra) => {
        const flash = encodeURIComponent(JSON.stringify({ flash: { message: '50% off applied' } }));
        const res = await request(app.getHttpServer())
            .get('/page')
            .set('X-Inertia', 'true')
            .set('X-Inertia-Version', '1.0.0')
            .set(extra)
            .set('Cookie', `__inertia_flash=${flash}`)
            .expect(200);
        expect(res.body.flash).toEqual({ message: '50% off applied' });
    });
});
