/**
 * The same Inertia flows on every supported HTTP platform. Handlers use only
 * platform-neutral Nest APIs (@Redirect, @Res({ passthrough }), exceptions),
 * the way a real app would.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    BadRequestException,
    Controller,
    Get,
    Injectable,
    MiddlewareConsumer,
    Module,
    NestModule,
    Post,
    Redirect,
    Res,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { NestExpressApplication } from '@nestjs/platform-express';
import Handlebars from 'handlebars';
import request from 'supertest';
import {
    HandleInertiaRequests,
    Inertia,
    InertiaModule,
    InertiaService,
    InertiaValidate,
    lazy,
} from '../src';

const VIEWS = path.join(__dirname, 'fixtures', 'views');
Handlebars.registerHelper('json', (value: unknown) =>
    JSON.stringify(value).replace(/</g, '\\u003c'),
);

/** Header-only slice of a response that both Express and Fastify support. */
type HeaderRes = { header(name: string, value: string): unknown };

@Injectable()
class AppInertiaRequests extends HandleInertiaRequests {
    async share() {
        return { appName: 'Demo' };
    }
}

@Controller()
class PagesController {
    constructor(private readonly inertia: InertiaService) {}

    @Get('/page')
    @Inertia('Page')
    page() {
        return { title: 'Hello', stats: lazy(() => [1, 2]) };
    }

    @Post('/save')
    @Redirect('/page', 302)
    save(@Res({ passthrough: true }) res: HeaderRes) {
        res.header('Set-Cookie', 'sid=abc123; Path=/');
        this.inertia.flash(res as never, { message: '50% saved' });
    }

    @Post('/comment')
    @Redirect('/page#comments', 302)
    comment() {}

    @Get('/go')
    @Redirect('/page#top', 302)
    go() {}

    @Post('/keep')
    @Redirect('/page', 302)
    keep(@Res({ passthrough: true }) res: HeaderRes) {
        this.inertia.preserveFragment(res as never);
    }

    @Post('/invalid')
    @InertiaValidate()
    invalid() {
        throw new BadRequestException({ errors: { email: 'Invalid email' } });
    }
}

@Module({
    imports: [InertiaModule.forRoot({ rootView: 'app', version: '1.0.0' })],
    controllers: [PagesController],
    providers: [AppInertiaRequests],
})
class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(AppInertiaRequests).forRoutes('*');
    }
}

async function createApp(platform: 'express' | 'fastify'): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    if (platform === 'express') {
        const app = moduleRef.createNestApplication<NestExpressApplication>();
        app.engine('hbs', (file: string, data: object, cb: (e: unknown, html?: string) => void) =>
            cb(null, Handlebars.compile(fs.readFileSync(file, 'utf8'))(data)),
        );
        app.setBaseViewsDir(VIEWS);
        app.setViewEngine('hbs');
        await app.init();
        return app;
    }

    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setViewEngine({ engine: { handlebars: Handlebars }, templates: VIEWS, viewExt: 'hbs' } as never);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return app;
}

const inertia = { 'X-Inertia': 'true', 'X-Inertia-Version': '1.0.0' };
const cookieHeader = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');

describe.each(['express', 'fastify'] as const)('Inertia flows on %s', (platform) => {
    let app: INestApplication;
    const http = () => request(app.getHttpServer());

    beforeAll(async () => {
        app = await createApp(platform);
    });

    afterAll(async () => {
        await app.close();
    });

    it('renders the first visit as HTML with the page JSON', async () => {
        const res = await http().get('/page').expect(200);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        const json = /data-page="app">(.*?)<\/script>/s.exec(res.text)?.[1];
        expect(JSON.parse(json!)).toMatchObject({
            component: 'Page',
            props: { title: 'Hello', appName: 'Demo', errors: {} },
            url: '/page',
        });
        expect(res.headers['vary']).toContain('X-Inertia');
    });

    it('returns the page object as JSON for Inertia visits', async () => {
        const res = await http().get('/page').set(inertia).expect(200);
        expect(res.headers['x-inertia']).toBe('true');
        expect(res.headers['vary']).toContain('X-Inertia');
        expect(res.body).toMatchObject({ component: 'Page', props: { title: 'Hello', appName: 'Demo' } });
        expect(res.body.props).not.toHaveProperty('stats');
    });

    it('handles partial reloads', async () => {
        const res = await http()
            .get('/page')
            .set({ ...inertia, 'X-Inertia-Partial-Component': 'Page', 'X-Inertia-Partial-Data': 'stats' })
            .expect(200);
        expect(res.body.props).toEqual({ errors: {}, stats: [1, 2] });
    });

    it('answers an asset version mismatch with 409', async () => {
        const res = await http().get('/page').set({ 'X-Inertia': 'true', 'X-Inertia-Version': 'old' }).expect(409);
        expect(res.headers['x-inertia-location']).toBe('/page');
        expect(res.headers['x-inertia-version']).toBe('1.0.0');
    });

    it('converts a redirect after an Inertia POST to 303, keeping other cookies', async () => {
        const res = await http().post('/save').set(inertia).expect(303);
        expect(res.headers['location']).toBe('/page');
        expect(cookieHeader(res)).toMatch(/sid=abc123/);
        expect(cookieHeader(res)).toMatch(/__inertia_flash=/);
    });

    it('delivers flash data on the next visit', async () => {
        const saved = await http().post('/save').set(inertia);
        const res = await http().get('/page').set(inertia).set('Cookie', cookieHeader(saved)).expect(200);
        expect(res.body.flash).toEqual({ message: '50% saved' });
    });

    it('turns an Inertia redirect to a #fragment into 409 + X-Inertia-Redirect', async () => {
        const res = await http().post('/comment').set(inertia).expect(409);
        expect(res.headers['x-inertia-redirect']).toBe('/page#comments');
        expect(res.headers['location']).toBeUndefined();

        const get = await http().get('/go').set(inertia).expect(409);
        expect(get.headers['x-inertia-redirect']).toBe('/page#top');
    });

    it('leaves fragment redirects alone for prefetches and plain browser requests', async () => {
        const prefetch = await http().get('/go').set({ ...inertia, Purpose: 'prefetch' }).expect(302);
        expect(prefetch.headers['location']).toBe('/page#top');

        const plain = await http().get('/go').expect(302);
        expect(plain.headers['location']).toBe('/page#top');
        expect(plain.headers['x-inertia-redirect']).toBeUndefined();
    });

    it('sends preserveFragment on the page after the redirect', async () => {
        const kept = await http().post('/keep').set(inertia).expect(303);
        const res = await http().get('/page').set(inertia).set('Cookie', cookieHeader(kept)).expect(200);
        expect(res.body.preserveFragment).toBe(true);

        const next = await http().get('/page').set(inertia).expect(200);
        expect(next.body).not.toHaveProperty('preserveFragment');
    });

    it('redirects back with validation errors that show on the next visit', async () => {
        const failed = await http().post('/invalid').set(inertia).set('Referer', '/page').expect(303);
        expect(failed.headers['location']).toBe('/page');
        const res = await http().get('/page').set(inertia).set('Cookie', cookieHeader(failed)).expect(200);
        expect(res.body.props.errors).toEqual({ email: 'Invalid email' });
    });
});
