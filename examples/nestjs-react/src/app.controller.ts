import { Controller, Get } from '@nestjs/common';
import { Inertia } from 'inertia-nestjs';

@Controller()
export class AppController {
  @Get('/')
  @Inertia('home')
  home() {
    return {
      appName: 'inertia-nestjs',
      message: 'Hello from NestJS + Inertia + React',
    };
  }

  @Get('/users')
  @Inertia('users/index')
  users() {
    return {
      users: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ],
    };
  }
}
