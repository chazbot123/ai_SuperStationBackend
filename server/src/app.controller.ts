import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getRoot() {
    return {
      name: 'ai-superweb-server',
      status: 'ok',
    };
  }
}