import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
    @Get('/')
    @Inertia('Home/Index')
    home() {
        return {
            message: 'Hello world',
        };
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

describe('first full page load (e2e)', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
        const viewsDir = mkdtempSync(join(tmpdir(), 'inertia-views-'));
        writeFileSync(join(viewsDir, 'app.hbs'), '<!-- template file -->');

        const moduleRef = await Test.createTestingModule({
            imports: [TestAppModule],
        }).compile();

        app = moduleRef.createNestApplication();

        app.engine(
            'hbs',
            (
                _filePath: string,
                options: Record<string, unknown>,
                callback: (err: Error | null, html?: string) => void,
            ) => {
                callback(
                    null,
                    `<!DOCTYPE html><html><body><div id="app" data-page='${JSON.stringify(
                        options.page,
                    )}'>${options.ssrBody ?? ''}</div></body></html>`,
                );
            },
        );
        app.setBaseViewsDir(viewsDir);
        app.setViewEngine('hbs');

        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    it('renders the root view for normal browser requests', async () => {
        const res = await request(app.getHttpServer()).get('/').expect(200);

        expect(res.headers['x-inertia']).toBeUndefined();
        expect(res.text).toContain('data-page=');
        expect(res.text).toContain('Home/Index');
        expect(res.text).toContain('Hello world');
    });
});
