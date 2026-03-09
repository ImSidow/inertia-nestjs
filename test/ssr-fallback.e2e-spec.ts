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
            message: 'Hello from CSR fallback',
        };
    }
}

@Module({
    imports: [
        InertiaModule.forRoot({
            rootView: 'app',
            version: '1.0.0',
            ssr: {
                enabled: true,
                url: 'http://127.0.0.1:13714',
                bundlePath: 'bootstrap/ssr/does-not-exist.js',
            },
        }),
    ],
    controllers: [TestController],
})
class TestAppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(HandleInertiaRequests).forRoutes('*');
    }
}

describe('SSR fallback (e2e)', () => {
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
                const ssrBody = options.ssrBody ?? '';
                callback(
                    null,
                    `<!DOCTYPE html><html><body><div id="app" data-page='${JSON.stringify(
                        options.page,
                    )}'>${ssrBody}</div></body></html>`,
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

    it('falls back to CSR when SSR bundle is missing', async () => {
        const res = await request(app.getHttpServer()).get('/').expect(200);

        expect(res.text).toContain('data-page=');
        expect(res.text).toContain('Hello from CSR fallback');
        expect(res.text).not.toContain('SSR CONTENT');
    });
});
