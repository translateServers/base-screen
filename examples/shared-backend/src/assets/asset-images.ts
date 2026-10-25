import { deflateSync } from 'node:zlib';

/**
 * 演示素材生成器：在种子阶段生成确定性的抽象 PNG，避免把二进制图片提交进仓库。
 *
 * 只服务示例后端，不进入任何发布包。颜色与构图固定，同一份代码在任何机器上生成
 * 同一张图；不依赖 canvas、sharp 或网络。
 */
export interface AssetPngSpec {
  readonly width: number;
  readonly height: number;
  readonly top: readonly [number, number, number];
  readonly bottom: readonly [number, number, number];
  readonly accent: readonly [number, number, number];
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function createAssetPng(spec: AssetPngSpec): Buffer {
  const { width, height } = spec;
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  const accentX = width * 0.3;
  const accentY = height * 0.34;
  const accentRadius = Math.min(width, height) * 0.22;

  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    raw[row] = 0;
    const t = height <= 1 ? 0 : y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      let r = mix(spec.top[0], spec.bottom[0], t);
      let g = mix(spec.top[1], spec.bottom[1], t);
      let b = mix(spec.top[2], spec.bottom[2], t);

      const band = (x / width + y / height - 0.7) / 0.16;
      if (band > -1 && band < 1) {
        const alpha = (1 - Math.abs(band)) * 0.22;
        r = mix(r, spec.accent[0], alpha);
        g = mix(g, spec.accent[1], alpha);
        b = mix(b, spec.accent[2], alpha);
      }

      const dx = x - accentX;
      const dy = y - accentY;
      const distance = Math.sqrt(dx * dx + dy * dy) / accentRadius;
      if (distance < 1) {
        const glow = (1 - distance) ** 2 * 0.9;
        r = mix(r, spec.accent[0], glow);
        g = mix(g, spec.accent[1], glow);
        b = mix(b, spec.accent[2], glow);
      }

      const vignette = 1 - 0.28 * Math.max(0, y / height - 0.55);
      const offset = row + 1 + x * 4;
      raw[offset] = clampByte(r * vignette);
      raw[offset + 1] = clampByte(g * vignette);
      raw[offset + 2] = clampByte(b * vignette);
      raw[offset + 3] = 255;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
