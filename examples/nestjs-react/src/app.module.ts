import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HandleInertiaRequests, InertiaModule } from 'inertia-nestjs';
import { AppController } from './app.controller';

@Module({
  imports: [
    InertiaModule.forRoot({
      rootView: 'app',
      version: '1.0.0',
      ssr: {
        enabled: true,
        url: 'http://127.0.0.1:13714',
        bundlePath: 'bootstrap/ssr/ssr.js',
      },
    }),
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HandleInertiaRequests).forRoutes('*');
  }
}
