import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BASE_SCREEN_ISOLATED_DOCUMENT_HASH_PATTERN,
  buildBaseScreenIsolatedSandboxCsp,
} from './material-isolated-csp';
import { MaterialSandboxStore } from './material-sandbox.store';

/** 一份文档最多 4MB（请求体限额与此一致，见 `material-sandbox-body.middleware.ts`）。 */
export const MATERIAL_SANDBOX_MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

/**
 * 沙箱路由永远只放行同源的顶层页面来框它（base-screen-docs ADR-0118 D3）：三个示例前端在 dev
 * 下都用各自的 Vite 代理把 `/api` 转到这个后端——从浏览器的角度看，响应始终"来自"前端自己的
 * origin，`'self'` 因此同时覆盖三端与生产环境下同源反代的部署方式。
 */
const FRAME_ANCESTORS = "'self'";

export interface MaterialSandboxDocument {
  readonly html: string;
  readonly csp: string;
}

@Injectable()
export class MaterialSandboxService {
  private readonly store = new MaterialSandboxStore();

  /**
   * 存一份沙箱文档：校验哈希格式、`sha256(html)` 与路径里的哈希一致、脚本哈希能拼出合法 CSP，
   * 任何一步不合格都是 400（ADR-0118 §3.3：CSP 由服务端写死，客户端哈希逐个严格校验）。
   */
  put(hash: string, html: unknown, scriptHashes: unknown): void {
    if (!BASE_SCREEN_ISOLATED_DOCUMENT_HASH_PATTERN.test(hash)) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        message: '沙箱文档哈希格式不合法。',
      });
    }
    if (typeof html !== 'string' || html.length === 0) {
      throw new BadRequestException({ error: 'INVALID_REQUEST', message: '沙箱文档缺少 html。' });
    }
    if (Buffer.byteLength(html, 'utf8') > MATERIAL_SANDBOX_MAX_DOCUMENT_BYTES) {
      throw new BadRequestException({
        error: 'MATERIAL_SANDBOX_DOCUMENT_TOO_LARGE',
        message: '沙箱文档超过 4MB 上限。',
      });
    }
    if (createHash('sha256').update(html, 'utf8').digest('hex') !== hash) {
      throw new BadRequestException({
        error: 'MATERIAL_SANDBOX_HASH_MISMATCH',
        message: '沙箱文档内容与请求路径里的哈希不一致。',
      });
    }
    if (!Array.isArray(scriptHashes)) {
      throw new BadRequestException({ error: 'INVALID_REQUEST', message: '缺少 scriptHashes。' });
    }
    const csp = buildBaseScreenIsolatedSandboxCsp(scriptHashes, FRAME_ANCESTORS);
    if (csp === undefined) {
      throw new BadRequestException({
        error: 'MATERIAL_SANDBOX_SCRIPT_HASHES_INVALID',
        message: 'scriptHashes 不合法：数量或格式不满足要求。',
      });
    }
    this.store.put(hash, html, csp);
  }

  /** 取一份文档；找不到（没存过，或 24 小时未访问被回收）时 404。 */
  get(hash: string): MaterialSandboxDocument {
    if (!BASE_SCREEN_ISOLATED_DOCUMENT_HASH_PATTERN.test(hash)) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        message: '沙箱文档哈希格式不合法。',
      });
    }
    const entry = this.store.get(hash);
    if (entry === undefined) {
      throw new NotFoundException({ error: 'NOT_FOUND', message: '沙箱文档不存在。' });
    }
    return { html: entry.html, csp: entry.csp };
  }

  /** `HEAD` 用：存在返回 true，不抛错也不重置格式校验之外的任何东西。 */
  has(hash: string): boolean {
    if (!BASE_SCREEN_ISOLATED_DOCUMENT_HASH_PATTERN.test(hash)) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        message: '沙箱文档哈希格式不合法。',
      });
    }
    return this.store.has(hash);
  }
}
