import {
    BadRequestException,
    Controller,
    MiddlewareConsumer,
    Module,
    NestModule,
    Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HandleInertiaRequests, InertiaModule, InertiaValidate } from '../src';

@Controller()
class TestController {
    @Post('/users')
    @InertiaValidate()
    create() {
        throw new BadRequestException({ errors: { email: 'Invalid email' } });
    }

    @Post('/users/success')
    @InertiaValidate()
    createSuccess() {
        // Deliberately returns nothing — matches the README's own example
        // (`async create(@Body() dto) { await this.users.create(dto); }`),
        // to check whether the success path redirects cleanly or crashes.
    }
}

@Module({
    imports: [
        InertiaModule.forRoot({
            rootView: 'app',
            version: '1.0.0',
        }),
    ],
    controllers: [TestController],
    // Deliberately NOT registering InertiaValidationFilter as APP_FILTER here.
    // This is exactly what's under test: does InertiaModule.forRoot() alone
    // make @InertiaValidate() work, or is the manual registration required?
})
class TestAppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(HandleInertiaRequests).forRoutes('*');
    }
}

describe('@InertiaValidate() with only InertiaModule.forRoot() registered (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [TestAppModule],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    it('redirects back (303) with flashed errors on validation failure', async () => {
        const res = await request(app.getHttpServer())
            .post('/users')
            .set('X-Inertia', 'true')
            .set('Referer', '/users/create')
            .send({});

        expect(res.status).toBe(303);
        expect(res.headers.location).toBe('/users/create');
    });

    it('redirects back (303) on the success path without crashing', async () => {
        const res = await request(app.getHttpServer())
            .post('/users/success')
            .set('X-Inertia', 'true')
            .set('Referer', '/users/create')
            .send({});

        expect(res.status).toBe(303);
        expect(res.headers.location).toBe('/users/create');
    });
});
