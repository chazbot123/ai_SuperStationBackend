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
    await prisma.businessCard.deleteMany({ where: { userId } });
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

  it('GET and PUT /api/business-cards/me should keep one card per user', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        username: testUsername,
        password: testPassword,
        deviceId: 'device-card',
        deviceName: 'Card Device',
      })
      .expect(201);

    accessToken = login.body.accessToken;

    const firstCard = await request(app.getHttpServer())
      .get('/api/business-cards/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(firstCard.body.userId).toBe(userId);

    await request(app.getHttpServer())
      .put('/api/business-cards/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        companyName: '智邻科技',
        jobTitle: '运营总监',
        phone: '13800000000',
        email: 'demo@zhilin.local',
        businessScope: 'AI超级站、企业名片与智能营销系统',
        coverImageUrl: 'https://example.local/cover.png',
        templateKey: 'dark_grid',
      })
      .expect(200);

    const secondCard = await request(app.getHttpServer())
      .get('/api/business-cards/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const cards = await prisma.businessCard.findMany({ where: { userId } });

    expect(cards).toHaveLength(1);
    expect(secondCard.body.id).toBe(firstCard.body.id);
    expect(secondCard.body.templateKey).toBe('dark_grid');
    expect(secondCard.body.coverImageUrl).toBe('https://example.local/cover.png');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
});