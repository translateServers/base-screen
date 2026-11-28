import type { NextFunction, Request, Response } from 'express';
import { MATERIAL_SANDBOX_MAX_DOCUMENT_BYTES } from './material-sandbox.service';

/**
 * `material-sandbox` 的 `PUT` 请求体上限是 4MB（ADR-0118 §4），全局默认 body-parser 限额
 * 100KB 不变——其余路由不受影响。Nest 的全局 JSON 解析器不支持按路径设不同的限额
 * （`app.useBodyParser()` 只能整站生效），所以这里手写一段只读 Node 内置流的中间件，挂在这一个
 * 路径前缀上，在全局解析器之前把 `PUT` 请求体读完、解析好、挂到 `req.body`。
 *
 * 全局解析器随后还会跑到这个请求上，但它会看到流已经 `end`（`onFinished.isFinished(req)` 为真），
 * 直接跳过不会覆盖这里设好的 `req.body`——这是 body-parser 自己的行为（支持多层 body 中间件叠加），
 * 不是本文件的假设。
 */
export function materialSandboxBodyParser(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (request.method !== 'PUT') {
    next();
    return;
  }
  const chunks: Buffer[] = [];
  let total = 0;
  let tooLarge = false;
  let settled = false;
  const reject = (status: number, message: string): void => {
    if (settled) return;
    settled = true;
    response
      .status(status)
      .json({ error: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST', message });
  };
  const declaredLength = Number(request.headers['content-length']);
  tooLarge =
    Number.isFinite(declaredLength) && declaredLength > MATERIAL_SANDBOX_MAX_DOCUMENT_BYTES;
  request.on('data', (chunk: Buffer) => {
    if (settled) return;
    total += chunk.length;
    if (total > MATERIAL_SANDBOX_MAX_DOCUMENT_BYTES) {
      // 超限后不再保留任何块，但继续把请求读完再响应。立即响应再断开会让客户端
      // 在响应刷出前收到 ECONNRESET，反而看不到明确的 413。
      tooLarge = true;
      chunks.length = 0;
      return;
    }
    if (!tooLarge) chunks.push(chunk);
  });
  request.on('end', () => {
    if (settled) return;
    if (tooLarge) {
      reject(413, '请求体超过 4MB 上限。');
      return;
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    try {
      (request as Request & { body?: unknown }).body = raw.length === 0 ? {} : JSON.parse(raw);
    } catch {
      reject(400, '请求体不是合法 JSON。');
      return;
    }
    settled = true;
    next();
  });
  request.on('error', () => {
    if (settled) return;
    settled = true;
    next(new Error('material-sandbox request stream error'));
  });
}
