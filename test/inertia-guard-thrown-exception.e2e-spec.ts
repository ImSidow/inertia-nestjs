import {
    CanActivate,
    Controller,
    ExecutionContext,
    Injectable,
    MiddlewareConsumer,
    Module,
    NestModule,
    Post,
    UnauthorizedException,
    UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HandleInertiaRequests, InertiaHandleException, InertiaModule } from '../src';

@Injectable()
class DenyGuard implements CanActivate {
    canActivate(_context: ExecutionContext): boolean {
        throw new UnauthorizedException({ errors: { auth: 'Not authorized' } });
    }
}

@Controller()
class TestController {
    @Post('/admin')
    @InertiaHandleException({ codes: [401] })
    @UseGuards(DenyGuard)
    adminOnly() {
        return 'unreachable';
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
})
class TestAppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(HandleInertiaRequests).forRoutes('*');
    }
}

describe('@InertiaHandleException() when the exception is thrown by a Guard, not the handler (e2e)', () => {
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

    it('redirects back (303) with flashed errors, instead of falling through to plain JSON', async () => {
        const res = await request(app.getHttpServer())
            .post('/admin')
            .set('X-Inertia', 'true')
            .set('Referer', '/dashboard')
            .send({});

        expect(res.status).toBe(303);
        expect(res.headers.location).toBe('/dashboard');
    });
});
