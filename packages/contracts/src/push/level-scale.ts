import {
  MAX_COMPONENT_STATE_PATH_SEGMENT_CODE_POINTS,
  MAX_COMPONENT_STATE_PATH_SEGMENTS,
  MAX_LEVEL_LABEL_CODE_POINTS,
  MAX_LEVEL_SCALE_LEVELS,
  MAX_LEVEL_SCALES,
} from '../document/limits.js';
import { codePointLength, hasControlCharacter } from '../json/canonical.js';
import type { ScreenSourceDeliveryIssue } from './delivery.js';

const SCALE_FIELDS = new Set(['path', 'levels']);
const LEVEL_FIELDS = new Set(['value', 'label', 'tone']);
const TONES = new Set(['danger', 'warning', 'info', 'success']);

/**
 * 校验宿主分级表（ADR-0110 §2.6.2）。资源类型贡献与来源目录项共用；`path` 相对 `levelScales`。
 * 返回空数组表示合法。
 */
export function listScreenLevelScaleIssues(value: unknown): readonly ScreenSourceDeliveryIssue[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LEVEL_SCALES) {
    return [
      { path: [], message: `Level scales must be an array of 1 to ${MAX_LEVEL_SCALES} items.` },
    ];
  }
  const issues: ScreenSourceDeliveryIssue[] = [];
  value.forEach((scale, index) => {
    const base = [String(index)];
    if (!isRecord(scale)) {
      issues.push({ path: base, message: 'Level scale must be an object.' });
      return;
    }
    for (const key of Object.keys(scale)) {
      if (!SCALE_FIELDS.has(key)) {
        issues.push({ path: [...base, key], message: `Unknown level scale field "${key}".` });
      }
    }
    const path = scale.path;
    if (
      !Array.isArray(path) ||
      path.length > MAX_COMPONENT_STATE_PATH_SEGMENTS ||
      path.some(
        (segment) =>
          typeof segment !== 'string' ||
          segment === '' ||
          codePointLength(segment) > MAX_COMPONENT_STATE_PATH_SEGMENT_CODE_POINTS,
      )
    ) {
      issues.push({ path: [...base, 'path'], message: 'Level scale path is invalid.' });
    }
    const levels = scale.levels;
    if (!Array.isArray(levels) || levels.length === 0 || levels.length > MAX_LEVEL_SCALE_LEVELS) {
      issues.push({
        path: [...base, 'levels'],
        message: `Level scale must declare 1 to ${MAX_LEVEL_SCALE_LEVELS} levels.`,
      });
      return;
    }
    const seen = new Set<string>();
    levels.forEach((level, levelIndex) => {
      const levelBase = [...base, 'levels', String(levelIndex)];
      if (!isRecord(level)) {
        issues.push({ path: levelBase, message: 'Level must be an object.' });
        return;
      }
      for (const key of Object.keys(level)) {
        if (!LEVEL_FIELDS.has(key)) {
          issues.push({ path: [...levelBase, key], message: `Unknown level field "${key}".` });
        }
      }
      const levelValue = level.value;
      if (
        !(typeof levelValue === 'string' && levelValue !== '') &&
        !(typeof levelValue === 'number' && Number.isFinite(levelValue))
      ) {
        issues.push({
          path: [...levelBase, 'value'],
          message: 'Level value must be a string or number.',
        });
      } else {
        const key = JSON.stringify(levelValue);
        if (seen.has(key)) {
          issues.push({ path: [...levelBase, 'value'], message: 'Level values must be unique.' });
        }
        seen.add(key);
      }
      const label = level.label;
      if (
        typeof label !== 'string' ||
        !/\S/.test(label) ||
        hasControlCharacter(label) ||
        codePointLength(label) > MAX_LEVEL_LABEL_CODE_POINTS
      ) {
        issues.push({ path: [...levelBase, 'label'], message: 'Level label is invalid.' });
      }
      if (typeof level.tone !== 'string' || !TONES.has(level.tone)) {
        issues.push({
          path: [...levelBase, 'tone'],
          message: 'Level tone must be danger, warning, info or success.',
        });
      }
    });
  });
  return issues;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
