import { codePointLength, hasControlCharacter } from '../json/canonical.js';

/**
 * 有界图片 URL 判定（ADR-0040 封面 URL 规则同形，ADR-0043 画布背景图复用）：
 * 非空字符串、1..maxCodePoints 码点、无控制字符（C0/DEL/C1）、无空白、无原始反斜杠；
 * 且匹配 http(s)://、//（协议相对）、/（根相对）、./、../（点相对）前缀 + 首字符分类形式。
 * 拒绝 data:/javascript:/blob:/file: 等其他 scheme、裸相对路径与边界形式（裸 /、裸 //、
 * https://、https:///x、http://?x 等）。失败关闭：不做完整 URL 语义解析、不剥离、不默认、不修复。
 */
const BOUNDED_URL_PATTERN = /^(?:https?:\/\/|\/\/)[^\s/?#\\]|^(?:\/|\.{1,2}\/)[^\s/\\]/;

export function isBoundedScreenImageUrl(value: unknown, maxCodePoints = 2048): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const length = codePointLength(value);
  if (length === 0 || length > maxCodePoints) {
    return false;
  }
  if (hasControlCharacter(value) || /[\s\\\u0080-\u009f]/.test(value)) {
    return false;
  }
  return BOUNDED_URL_PATTERN.test(value);
}
