import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('demo alarms (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the seeded snapshot and applies deterministic mutations', async () => {
    const initial = await request(app.getHttpServer()).get('/api/demo/alarms').expect(200);
    expect(initial.body).toMatchObject({
      revision: 1,
      alarms: [{ key: 'alarm.open', level: 'warning' }],
    });

    const raised = await request(app.getHttpServer())
      .post('/api/demo/alarms/raise')
      .send({ key: 'alarm.open', level: 'critical', message: '超限' })
      .expect(201);
    expect(raised.body.alarm).toMatchObject({ key: 'alarm.open', level: 'critical' });

    const afterRaise = await request(app.getHttpServer()).get('/api/demo/alarms').expect(200);
    expect(afterRaise.body).toMatchObject({
      revision: 2,
      alarms: [{ key: 'alarm.open', level: 'critical' }],
    });

    await request(app.getHttpServer())
      .post('/api/demo/alarms/clear')
      .send({ key: 'alarm.open' })
      .expect(201)
      .expect({ changed: true });

    await request(app.getHttpServer())
      .post('/api/demo/alarms/reset')
      .expect(201)
      .expect((response) => {
        expect(response.body).toMatchObject({
          revision: 4,
          alarms: [{ key: 'alarm.open', level: 'warning' }],
        });
      });
  });

  it('rejects malformed alarm keys through the global validation pipe', async () => {
    await request(app.getHttpServer())
      .post('/api/demo/alarms/raise')
      .send({ key: 'UPPER CASE' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/demo/alarms/suppress')
      .send({ key: 'alarm.open', suppressed: 'yes' })
      .expect(400);
  });
});
