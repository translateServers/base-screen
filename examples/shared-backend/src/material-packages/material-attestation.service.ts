import {
  createHash,
  createPrivateKey,
  createPublicKey,
  createSign,
  generateKeyPairSync,
  type KeyObject,
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';

/**
 * L3 隔离代码物料的发布签名（base-screen-docs ADR-0117 D11）：发布时宿主后端算出
 * `sha256(code)`（`code` 就是组件工坊存文本的那份模块，逐字包含 `spec` 与 `source`，参见
 * `material-packages.service.ts` 的 `isIsolatedModuleCode`），连同起草模型、提示哈希、
 * 审核人、时间戳签成一份 attestation，和包一起存。
 *
 * 用 ECDSA P-256：Node 的 `crypto` 与浏览器 `SubtleCrypto` 都原生支持这条曲线，私钥只活在
 * 本进程与 `data/` 下的密钥文件（随 screens.db 一样是本机状态，不进仓库）；签名用
 * `dsaEncoding: 'ieee-p1363'`（r‖s 拼接），这正是 `SubtleCrypto.verify({ name: 'ECDSA' })`
 * 要的格式，不是 Node 默认的 DER。
 */
export interface MaterialAttestation {
  readonly alg: 'ECDSA-P256-SHA256';
  readonly contentHash: string;
  readonly reviewer: string;
  readonly signedAt: string;
  readonly signature: string;
  readonly model?: string;
  readonly promptHash?: string;
}

interface StoredKeyPair {
  readonly privateJwk: Record<string, unknown>;
  readonly publicJwk: Record<string, unknown>;
}

function keyFilePath(): string {
  return resolve(__dirname, '..', '..', 'data', 'material-attestation-key.json');
}

/** 签名覆盖的内容：顺序固定，任何一项被改都验不过。 */
export function materialAttestationPayload(
  contentHash: string,
  model: string | undefined,
  promptHash: string | undefined,
  reviewer: string,
  signedAt: string,
): string {
  return [contentHash, model ?? '', promptHash ?? '', reviewer, signedAt].join('.');
}

@Injectable()
export class MaterialAttestationService {
  private readonly logger = new Logger('MaterialAttestationService');
  private privateKey: KeyObject | undefined;
  private publicJwk: Record<string, unknown> | undefined;

  private ensureKeys(): { readonly privateKey: KeyObject } {
    if (this.privateKey !== undefined) return { privateKey: this.privateKey };
    const file = keyFilePath();
    if (existsSync(file)) {
      try {
        const stored = JSON.parse(readFileSync(file, 'utf8')) as StoredKeyPair;
        this.privateKey = createPrivateKey({
          key: stored.privateJwk as Record<string, string>,
          format: 'jwk',
        });
        this.publicJwk = stored.publicJwk;
        return { privateKey: this.privateKey };
      } catch (error) {
        this.logger.warn(
          `物料签名密钥文件损坏，重新生成：${String((error as Error)?.message ?? error)}`,
        );
      }
    }
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const privateJwk = privateKey.export({ format: 'jwk' }) as Record<string, unknown>;
    const publicJwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ privateJwk, publicJwk }), { mode: 0o600 });
    this.privateKey = privateKey;
    this.publicJwk = publicJwk;
    this.logger.log(`已生成新的物料签名密钥：${file}`);
    return { privateKey };
  }

  /** 供校验端导入的公钥（JWK，可安全公开）。 */
  publicKeyJwk(): Record<string, unknown> {
    this.ensureKeys();
    // 走过 ensureKeys 后 publicJwk 必定已填；没有私钥文件时也会在生成分支里一起写入。
    if (this.publicJwk === undefined) {
      const publicKey = createPublicKey(this.privateKey as KeyObject);
      this.publicJwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
    }
    return this.publicJwk;
  }

  contentHash(code: string): string {
    return createHash('sha256').update(code, 'utf8').digest('hex');
  }

  sign(input: {
    readonly code: string;
    readonly reviewer: string;
    readonly model?: string;
    readonly promptHash?: string;
  }): MaterialAttestation {
    const { privateKey } = this.ensureKeys();
    const contentHash = this.contentHash(input.code);
    const signedAt = new Date().toISOString();
    const payload = materialAttestationPayload(
      contentHash,
      input.model,
      input.promptHash,
      input.reviewer,
      signedAt,
    );
    const signer = createSign('SHA256');
    signer.update(payload, 'utf8');
    signer.end();
    const signature = signer
      .sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })
      .toString('base64');
    return {
      alg: 'ECDSA-P256-SHA256',
      contentHash,
      reviewer: input.reviewer,
      signedAt,
      signature,
      ...(input.model === undefined ? {} : { model: input.model }),
      ...(input.promptHash === undefined ? {} : { promptHash: input.promptHash }),
    };
  }
}
