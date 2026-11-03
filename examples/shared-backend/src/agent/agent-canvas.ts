/**
 * 画布动作：把"把背景改成天蓝色"这类句子翻成 `update-canvas` 的 patch。
 *
 * 纯粹是确定性解析——画布按钮不做语义理解，只认"背景色 / 背景图 / 去掉背景图"三种，
 * 认不出就返回 null，交给动作路由决定要不要问模型。
 *
 * 颜色表与宿主侧 `parseCanvasBackgroundInstruction` 保持一致：同一句话不论走规则还是走
 * 路由，落到文档里的值必须相同，否则同一句话会出现两种结果。
 */

/** 只含本模块认识的键，避免把任意对象直接塞进 `update-canvas`。 */
export interface AgentCanvasPatch {
  readonly backgroundColor?: string;
  readonly backgroundImage?: string | null;
  readonly backgroundImageFit?: 'cover' | 'contain' | null;
}

export interface AgentCanvasState {
  readonly backgroundColor?: string;
  readonly hasBackgroundImage?: boolean;
}

const MAX_IMAGE_URL_LENGTH = 2048;

const CANVAS_COLORS: readonly (readonly [string, string])[] = [
  ['天蓝', '#87ceeb'],
  ['天空蓝', '#87ceeb'],
  ['浅蓝', '#a9c8f5'],
  ['淡蓝', '#a9c8f5'],
  ['深蓝', '#16305c'],
  ['藏青', '#1e293b'],
  ['米', '#f2ead8'],
  ['粉', '#f5c2d1'],
  ['红', '#d64545'],
  ['蓝', '#3b82f6'],
  ['绿', '#3fae6a'],
  ['白', '#ffffff'],
  ['黑', '#0b1020'],
  ['黄', '#f4c542'],
  ['橙', '#ef8a3c'],
  ['紫', '#8b7cf6'],
  ['灰', '#8b97a8'],
];

/**
 * 识别画布指令；与当前值相同或认不出时返回 null。
 *
 * 返回 null 的两种情况要分开看：认不出（交给路由）与没变化（不提交空提案）。调用方
 * 用 `isCanvasInstruction` 区分——它只判"像不像画布指令"，不看当前值。
 */
export function matchCanvasInstruction(
  text: string,
  current: AgentCanvasState = {},
): AgentCanvasPatch | null {
  const patch = parseCanvasInstruction(text);
  if (patch === null) return null;
  return canvasPatchChanges(patch, current) ? patch : null;
}

/** 只判语义，不看当前值：路由用它决定"要不要跳过模型"。 */
export function isCanvasInstruction(text: string): boolean {
  return parseCanvasInstruction(text) !== null;
}

export function canvasPatchChanges(patch: AgentCanvasPatch, current: AgentCanvasState): boolean {
  if (patch.backgroundColor !== undefined && patch.backgroundColor !== current.backgroundColor) {
    return true;
  }
  if (patch.backgroundImage === null) {
    return current.hasBackgroundImage === true;
  }
  return patch.backgroundImage !== undefined;
}

function parseCanvasInstruction(text: string): AgentCanvasPatch | null {
  const trimmed = text.trim();

  // 去掉背景图：语义明确，即使当前没有图也算画布指令（只是不会产生变更）。
  if (/(?:去掉|删除|清除|取消|移除)\s*(?:背景图|背景图片|底图)/.test(trimmed)) {
    return { backgroundImage: null, backgroundImageFit: null };
  }

  if (/(?:背景图|背景图片|底图)/.test(trimmed)) {
    const url = extractImageUrl(trimmed);
    if (url !== null) return { backgroundImage: url, backgroundImageFit: 'cover' };
  }

  const color = extractBackgroundColor(trimmed);
  return color === null ? null : { backgroundColor: color };
}

/** 背景色的句式收得很窄：颜色必须紧跟在改动词后面，避免把"把背景改成天蓝色条纹"当纯色。 */
function extractBackgroundColor(text: string): string | null {
  const match = text.match(
    /^(?:把|将)?\s*(?:画布|页面|大屏|屏幕|整屏)?\s*的?\s*(?:背景|底色)(?:颜色|色)?\s*(?:改|换|设|调|变)(?:为|成|到|一下)?\s*(.+)$/,
  );
  if (match === null) return null;
  const value = (match[1] ?? '').trim().replace(/[。.!！?？]+$/g, '');
  if (value === '') return null;
  return parseCanvasColor(value);
}

export function parseCanvasColor(value: string): string | null {
  const trimmed = value.trim();
  const hex = /^#[0-9a-f]{3,8}$/i.exec(trimmed);
  if (hex !== null) return hex[0].toLowerCase();
  const normalized = trimmed.replace(/\s+/g, '').replace(/色$/, '');
  return CANVAS_COLORS.find(([name]) => name === normalized)?.[1] ?? null;
}

function extractImageUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  if (match === null) return null;
  const url = match[0];
  if (url.length > MAX_IMAGE_URL_LENGTH) return null;
  return url;
}
