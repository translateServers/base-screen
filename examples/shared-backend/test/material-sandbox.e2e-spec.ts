import { createHash } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MATERIAL_SANDBOX_MAX_DOCUMENT_BYTES } from '../src/material-sandbox/material-sandbox.service';
import { materialSandboxBodyParser } from '../src/material-sandbox/material-sandbox-body.middleware';

jest.setTimeout(15_000);

/** 测试用沙箱文档：内容固定，哈希随之固定——写错一处都会被 Service 的双重校验挡下。 */
const HTML = '<!doctype html><html><body><script>1+1;</script></body></html>';
const DOC_HASH = createHash('sha256').update(HTML, 'utf8').digest('hex');
const SCRIPT_HASH = (() => {
  const digest = createHash('sha256').update('1+1;', 'utf8').digest('base64');
  return `'sha256-${digest}'`;
})();

describe('L3 sandbox route (e2e, ADR-0118)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use('/api/material-sandbox', materialSandboxBodyParser);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects malformed hash, hash mismatch, and bad script hashes', async () => {
    const server = app.getHttpServer();

    const badPathHash = await request(server)
      .put('/api/material-sandbox/not-a-hash')
      .send({ html: HTML, scriptHashes: [SCRIPT_HASH] })
      .expect(400);
    expect(badPathHash.body.error).toBe('INVALID_REQUEST');

    const mismatch = await request(server)
      .put(`/api/material-sandbox/${DOC_HASH}`)
      .send({ html: `${HTML}<!-- tampered -->`, scriptHashes: [SCRIPT_HASH] })
      .expect(400);
    expect(mismatch.body.error).toBe('MATERIAL_SANDBOX_HASH_MISMATCH');

    const badHashes = await request(server)
      .put(`/api/material-sandbox/${DOC_HASH}`)
      .send({ html: HTML, scriptHashes: ['not-a-csp-hash'] })
      .expect(400);
    expect(badHashes.body.error).toBe('MATERIAL_SANDBOX_SCRIPT_HASHES_INVALID');

    const emptyHashes = await request(server)
      .put(`/api/material-sandbox/${DOC_HASH}`)
      .send({ html: HTML, scriptHashes: [] })
      .expect(400);
    expect(emptyHashes.body.error).toBe('INVALID_REQUEST');

    // 客户端不能把 `; connect-src *` 之类的指令拼进 script-src。
    const injected = await request(server)
      .put(`/api/material-sandbox/${DOC_HASH}`)
      .send({ html: HTML, scriptHashes: [`${SCRIPT_HASH}; connect-src *`] })
      .expect(400);
    expect(injected.body.error).toBe('MATERIAL_SANDBOX_SCRIPT_HASHES_INVALID');
  });

  it('accepts >100KB through the route-specific body parser and rejects >4MB', async () => {
    const server = app.getHttpServer();
    const largeScript = `1+1;${' '.repeat(110 * 1024)}`;
    const largeHtml = `<!doctype html><html><body><script>${largeScript}</script></body></html>`;
    const largeHash = createHash('sha256').update(largeHtml, 'utf8').digest('hex');
    const largeScriptHash = `'sha256-${createHash('sha256')
      .update(largeScript, 'utf8')
      .digest('base64')}'`;

    // 全局 JSON 解析器仍是 100KB；这条路由必须由专用中间件接管，否则这里会被 413。
    await request(server)
      .put(`/api/material-sandbox/${largeHash}`)
      .send({ html: largeHtml, scriptHashes: [largeScriptHash] })
      .expect(204);

    const oversized = 'x'.repeat(MATERIAL_SANDBOX_MAX_DOCUMENT_BYTES + 1);
    const tooLarge = await request(server)
      .put(`/api/material-sandbox/${DOC_HASH}`)
      .send({ html: oversized, scriptHashes: [SCRIPT_HASH] })
      .expect(413);
    expect(tooLarge.body.error).toBe('PAYLOAD_TOO_LARGE');
  });

  it('404s on HEAD/GET for a document that was never stored', async () => {
    const server = app.getHttpServer();
    const neverStored = createHash('sha256').update('never-stored', 'utf8').digest('hex');
    await request(server).head(`/api/material-sandbox/${neverStored}`).expect(404);
    const missing = await request(server).get(`/api/material-sandbox/${neverStored}`).expect(404);
    expect(missing.body.error).toBe('NOT_FOUND');
  });

  it('stores, serves with the fixed CSP headers, and stays idempotent on repeat PUT', async () => {
    const server = app.getHttpServer();

    await request(server)
      .put(`/api/material-sandbox/${DOC_HASH}`)
      .send({ html: HTML, scriptHashes: [SCRIPT_HASH] })
      .expect(204);

    // 同一份内容再 PUT 一次：按 ADR-0118 D1 应当幂等，不因为"已经存在"报错。
    await request(server)
      .put(`/api/material-sandbox/${DOC_HASH}`)
      .send({ html: HTML, scriptHashes: [SCRIPT_HASH] })
      .expect(204);

    await request(server).head(`/api/material-sandbox/${DOC_HASH}`).expect(200);

    const fetched = await request(server).get(`/api/material-sandbox/${DOC_HASH}`).expect(200);
    expect(fetched.text).toBe(HTML);
    expect(fetched.headers['content-type']).toContain('text/html');
    expect(fetched.headers['x-content-type-options']).toBe('nosniff');
    expect(fetched.headers['referrer-policy']).toBe('no-referrer');
    expect(fetched.headers['cross-origin-resource-policy']).toBe('same-site');
    const csp = fetched.headers['content-security-policy'] as string;
    expect(csp).toContain('sandbox allow-scripts');
    expect(csp).toContain(`script-src ${SCRIPT_HASH}`);
    expect(csp).toContain("frame-ancestors 'self'");
  });
});
