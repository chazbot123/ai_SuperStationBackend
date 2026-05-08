import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, SessionStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for e2e tests');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
const testUsername = 'demo_admin';
const testPassword = '123456';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let accessToken = '';
  let userId = '';

  beforeAll(async () => {
    const user = await prisma.user.findUnique({ where: { username: testUsername } });
    if (!user) {
      throw new Error('seed user demo_admin not found');
    }

    userId = user.id;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  beforeEach(async () => {
    await prisma.userSession.deleteMany({ where: { userId } });
  });

  it('GET /api should return service status', async () => {
    await request(app.getHttpServer()).get('/api').expect(200).expect({
      name: 'ai-superweb-server',
      status: 'ok',
    });
  });

  it('POST /api/auth/login should squeeze the oldest session on the third device', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        username: testUsername,
        password: testPassword,
        deviceId: 'device-1',
        deviceName: 'Device 1',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        username: testUsername,
        password: testPassword,
        deviceId: 'device-2',
        deviceName: 'Device 2',
      })
      .expect(201);

    const thirdLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        username: testUsername,
        password: testPassword,
        deviceId: 'device-3',
        deviceName: 'Device 3',
      })
      .expect(201);

    accessToken = thirdLogin.body.accessToken;

    const sessions = await prisma.userSession.findMany({
      where: { userId },
      orderBy: { loggedInAt: 'asc' },
      select: { deviceId: true, status: true },
    });

    expect(sessions).toHaveLength(3);
    expect(sessions[0]).toEqual({
      deviceId: 'device-1',
      status: SessionStatus.squeezed,
    });
    expect(sessions[1]).toEqual({
      deviceId: 'device-2',
      status: SessionStatus.active,
    });
    expect(sessions[2]).toEqual({
      deviceId: 'device-3',
      status: SessionStatus.active,
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
});
