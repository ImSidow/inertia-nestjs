/**
 * handleExceptionsUsing (error pages) and same-origin "redirect back", on
 * every platform.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    BadRequestException,
    Controller,
    ForbiddenException,
    Get,
    HttpException,
    Injectable,
    Logger,
    MiddlewareConsumer,
    Module,
    NestModule,
    Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { NestExpressApplication } from '@nestjs/platform-express';
import Handlebars from 'handlebars';
import request from 'supertest';
import { always, HandleInertiaRequests, Inertia, InertiaModule, InertiaValidate, lazy } from '../src';

const VIEWS = path.join(__dirname, 'fixtures', 'views');
Handlebars.registerHelper('json', (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c'));

@Injectable()
class AppInertiaRequests extends HandleInertiaRequests {
    async share() {
        return { appName: 'Demo' };
    }
}

@Controller()
class PagesController {
    @Get('/boom')
    boom(): never {
        throw new Error('database password is hunter2'); // must never reach the client
    }

    @Get('/forbidden')
    forbidden(): never {
        throw new ForbiddenException();
    }

    @Get('/teapot')
    teapot(): never {
        throw new HttpException("I'm a teapot", 418);
    }

    /** Fails mid-render, after the response was marked as rendered. */
    @Get('/prop-crash')
    @Inertia('Page')
    propCrash() {
        return {
            lazyOk: lazy(() => 1),
            // always(): evaluated on every visit, so it fails while rendering.
            broken: always(() => {
                throw new Error('prop factory failed');
            }),
        };
    }

    @Get('/callback-crash')
    callbackCrash(): never {
        throw new Error('original error');
    }

    @Post('/form')
    @InertiaValidate()
    form(): never {
        throw new BadRequestException({ errors: { name: 'Required.' } });
    }

    /** Re-renders a component on error; a plain browser post gets it as HTML. */
    @Post('/form-render')
    @InertiaValidate('Form')
    formRender(): never {
        throw new BadRequestException({ errors: { name: 'Required.' } });
    }
}

@Module({
    imports: [
        InertiaModule.forRoot({
            rootView: 'app',
            version: '1',
            handleExceptionsUsing: (error) => {
                if (error.request.url === '/callback-crash') throw new Error('error page itself failed');
                if ([403, 404, 500].includes(error.statusCode)) {
                    return error.render('Error', { status: error.statusCode });
                }
            },
        }),
    ],
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

const inertia = { 'X-Inertia': 'true', 'X-Inertia-Version': '1' };
const pageFromHtml = (html: string) => JSON.parse(/data-page="app">(.*?)<\/script>/s.exec(html)![1]);

describe.each(['express', 'fastify'] as const)('error pages and redirect back on %s', (platform) => {
    let app: INestApplication;
    const http = () => request(app.getHttpServer());

    beforeAll(async () => {
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        app = await createApp(platform);
    });
    afterAll(async () => {
        vi.restoreAllMocks();
        await app.close();
    });

    describe('handleExceptionsUsing', () => {
        it('answers an Inertia visit to a crashing page with the error page and status 500', async () => {
            const res = await http().get('/boom').set(inertia).expect(500);
            expect(res.headers['x-inertia']).toBe('true');
            expect(res.body).toMatchObject({ component: 'Error', props: { status: 500, appName: 'Demo' } });
            expect(res.text).not.toContain('hunter2');
        });

        it('answers a browser visit to an unknown route with an HTML error page and status 404', async () => {
            const res = await http().get('/nope').expect(404);
            expect(res.headers['content-type']).toMatch(/text\/html/);
            expect(pageFromHtml(res.text)).toMatchObject({ component: 'Error', props: { status: 404 } });
        });

        it('renders other statuses the callback chooses (403)', async () => {
            const res = await http().get('/forbidden').set(inertia).expect(403);
            expect(res.body.component).toBe('Error');
        });

        it('falls through to the default response when the callback returns nothing', async () => {
            const res = await http().get('/teapot').set(inertia).expect(418);
            expect(res.body).toMatchObject({ statusCode: 418, message: "I'm a teapot" });
        });

        it('keeps JSON for clients that ask for JSON only', async () => {
            const res = await http().get('/boom').set('Accept', 'application/json').expect(500);
            expect(res.body).toEqual({ statusCode: 500, message: 'Internal server error' });
        });

        it('renders the error page when a page fails mid-render, without hanging', async () => {
            const res = await http().get('/prop-crash').set(inertia).timeout(3000).expect(500);
            expect(res.body.component).toBe('Error');
        });

        it('falls back to the default error when the callback itself throws', async () => {
            const res = await http().get('/callback-crash').set(inertia).timeout(3000).expect(500);
            expect(res.body).toEqual({ statusCode: 500, message: 'Internal server error' });
        });

        it('sends the HTML of a re-rendered form with its status (422), not 200', async () => {
            const res = await http().post('/form-render').set('Accept', 'text/html').expect(422);
            expect(res.headers['content-type']).toMatch(/text\/html/);
            expect(pageFromHtml(res.text)).toMatchObject({ component: 'Form', props: { errors: { name: 'Required.' } } });
        });

        it('does not touch validation redirects', async () => {
            const res = await http().post('/form').set(inertia).set('Referer', '/form').expect(303);
            expect(res.headers['location']).toBe('/form');
        });
    });

    describe('redirect back stays on this site', () => {
        it('ignores a Referer from another site', async () => {
            const res = await http().post('/form').set(inertia).set('Referer', 'https://evil.test/phish').expect(303);
            expect(res.headers['location']).toBe('/');
        });

        it('ignores a protocol-relative Referer', async () => {
            const res = await http().post('/form').set(inertia).set('Referer', '//evil.test/phish').expect(303);
            expect(res.headers['location']).toBe('/');
        });

        it('keeps an absolute Referer on this host', async () => {
            const res = await http()
                .post('/form')
                .set(inertia)
                .set('Host', 'app.example.com')
                .set('Referer', 'https://app.example.com/settings?tab=2')
                .expect(303);
            expect(res.headers['location']).toBe('https://app.example.com/settings?tab=2');
        });
    });
});
