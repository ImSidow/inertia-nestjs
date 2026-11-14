/**
 * Form and guard flows a real app relies on, on every platform: success
 * redirects, field-keyed validation errors, class-level decorators, and
 * redirects for plain browser requests.
 */
import {
    Body,
    CanActivate,
    Controller,
    Get,
    Injectable,
    MiddlewareConsumer,
    Module,
    NestModule,
    Post,
    Redirect,
    UnauthorizedException,
    UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Type } from 'class-transformer';
import { IsNotEmpty, MinLength, ValidateNested } from 'class-validator';
import request from 'supertest';
import {
    HandleInertiaRequests,
    Inertia,
    InertiaHandleException,
    InertiaModule,
    InertiaValidate,
    InertiaValidationPipe,
} from '../src';

class AddressDto {
    @IsNotEmpty({ message: 'City is required.' })
    city!: string;
}

class ItemDto {
    @MinLength(3, { message: 'Name must be at least 3 characters.' })
    name!: string;

    @ValidateNested()
    @Type(() => AddressDto)
    address!: AddressDto;
}

@Injectable()
class DenyGuard implements CanActivate {
    canActivate(): boolean {
        throw new UnauthorizedException('Please sign in first.');
    }
}

/** Class-level decorator + class-level guard: the usual Nest way to protect a controller. */
@Controller('guarded')
@UseGuards(DenyGuard)
@InertiaHandleException({ codes: [401], returnPath: '/login' })
class GuardedController {
    @Get()
    @Inertia('Guarded')
    index() {
        return {};
    }
}

/** A class-level decorator must not hijack pages that render themselves. */
@Controller('pages')
@InertiaHandleException()
class PagesController {
    @Get()
    @Inertia('Page')
    index() {
        return { ok: true };
    }
}

/** Class-level auth rule + a form route: the rule's returnPath is only for 401s. */
@Controller('posts')
@InertiaHandleException({ codes: [401], returnPath: '/login' })
class PostsController {
    @Post('comments')
    @InertiaValidate()
    comment(@Body() _dto: ItemDto) {}
}

@Controller()
class FormsController {
    @Get('/form')
    @Inertia('Form')
    form() {
        return {};
    }

    @Post('/items')
    @InertiaValidate()
    @Redirect('/items/1', 302)
    create(@Body() _dto: ItemDto) {}

    @Post('/items/back')
    @InertiaValidate()
    createAndGoBack(@Body() _dto: ItemDto) {}
}

@Module({
    imports: [InertiaModule.forRoot({ rootView: 'app', version: '1' })],
    controllers: [GuardedController, PagesController, PostsController, FormsController],
    providers: [DenyGuard],
})
class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(HandleInertiaRequests).forRoutes('*');
    }
}

async function createApp(platform: 'express' | 'fastify'): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app =
        platform === 'fastify'
            ? moduleRef.createNestApplication(new FastifyAdapter())
            : moduleRef.createNestApplication();
    app.useGlobalPipes(new InertiaValidationPipe());
    await app.init();
    await (app.getHttpAdapter().getInstance() as { ready?: () => Promise<unknown> }).ready?.();
    return app;
}

const inertia = { 'X-Inertia': 'true', 'X-Inertia-Version': '1' };
const cookies = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');
const valid = { name: 'Widget', address: { city: 'Mogadishu' } };

describe.each(['express', 'fastify'] as const)('form and guard flows on %s', (platform) => {
    let app: INestApplication;
    const http = () => request(app.getHttpServer());

    beforeAll(async () => {
        app = await createApp(platform);
    });
    afterAll(() => app.close());

    describe('class-level @InertiaHandleException with a guard', () => {
        it('redirects an Inertia visit to returnPath with the guard message', async () => {
            const res = await http().get('/guarded').set(inertia).expect(303);
            expect(res.headers['location']).toBe('/login');
            const next = await http().get('/form').set(inertia).set('Cookie', cookies(res)).expect(200);
            expect(next.body.props.errors).toEqual({ error: 'Please sign in first.' });
        });

        it('redirects a plain browser visit too', async () => {
            const res = await http().get('/guarded').set('Accept', 'text/html,*/*').expect(303);
            expect(res.headers['location']).toBe('/login');
        });

        it('keeps answering JSON clients with JSON', async () => {
            const res = await http().get('/guarded').set('Accept', 'application/json').expect(401);
            expect(res.body.message).toBe('Please sign in first.');
        });

        it("does not send a form's validation errors to the class-level returnPath", async () => {
            const res = await http().post('/posts/comments').set(inertia).set('Referer', '/posts/1').send({ name: 'x' }).expect(303);
            expect(res.headers['location']).toBe('/posts/1');
        });

        it('does not send a successful form to the class-level returnPath', async () => {
            const res = await http().post('/posts/comments').set(inertia).set('Referer', '/posts/1').send(valid).expect(303);
            expect(res.headers['location']).toBe('/posts/1');
        });

        it('leaves pages that render themselves alone', async () => {
            const res = await http().get('/pages').set(inertia).expect(200);
            expect(res.body).toMatchObject({ component: 'Page', props: { ok: true } });
        });
    });

    describe('success redirects', () => {
        it("follow the handler's @Redirect, not the Referer", async () => {
            const res = await http().post('/items').set(inertia).set('Referer', '/form').send(valid).expect(303);
            expect(res.headers['location']).toBe('/items/1');
        });

        it('go back to the Referer when the handler does not redirect', async () => {
            const res = await http().post('/items/back').set(inertia).set('Referer', '/form').send(valid).expect(303);
            expect(res.headers['location']).toBe('/form');
        });
    });

    describe('InertiaValidationPipe', () => {
        it('flashes class-validator errors keyed by field, nested ones by dot path', async () => {
            const res = await http()
                .post('/items')
                .set(inertia)
                .set('Referer', '/form')
                .send({ name: 'x', address: {} })
                .expect(303);
            expect(res.headers['location']).toBe('/form');
            const next = await http().get('/form').set(inertia).set('Cookie', cookies(res)).expect(200);
            expect(next.body.props.errors).toEqual({
                name: 'Name must be at least 3 characters.',
                'address.city': 'City is required.',
            });
        });
    });
});
