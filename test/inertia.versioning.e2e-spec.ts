import {
    Controller,
    Get,
    MiddlewareConsumer,
    Module,
    NestModule,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { HandleInertiaRequests, Inertia, InertiaModule } from '../src';

@Controller()
class TestController {
    @Get('/users')
    @Inertia('Users/Index')
    users() {
        return {
            users: [{ id: 1, name: 'Alice' }],
        };
    }
}

@Module({
    imports: [
        InertiaModule.forRoot({
            rootView: 'app',
            version: '2.0.0',
        }),
    ],
    controllers: [TestController],
})
class TestAppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(HandleInertiaRequests).forRoutes('*');
    }
}

describe('Inertia versioning (e2e)', () => {
    let app: NestExpressApplication;

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

    it('returns 409 and X-Inertia-Location when asset versions mismatch', async () => {
        const res = await request(app.getHttpServer())
            .get('/users')
            .set('X-Inertia', 'true')
            .set('X-Inertia-Version', '1.0.0')
            .expect(409);

        expect(res.headers['x-inertia-location']).toBe('/users');
    });
});
