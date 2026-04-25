import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('should return service status payload', () => {
    expect(appController.getRoot()).toEqual({
      name: 'ai-superweb-server',
      status: 'ok',
    });
  });
});