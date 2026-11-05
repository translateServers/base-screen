import type { ScreenCanvasBackground, ScreenCanvasBackgroundType } from '@base-screen/contracts';
import {
  isScreenCanvasBackground,
  SCREEN_CANVAS_BACKGROUND_TYPES,
  type ScreenDocument,
} from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  type AgentCanvasPatch,
  matchCanvasInstruction,
} from '../../examples/shared-backend/src/agent/agent-canvas';
import {
  AGENT_CANVAS_BACKGROUND_SCHEMA,
  AGENT_CANVAS_BACKGROUND_TYPES,
} from '../../examples/shared-backend/src/agent/agent-route';
import { compileCanvasCommands } from '../../examples/vanilla-host/src/screen/host-intent';
// 根级测试只链接了 contracts；这里要跑真正的命令执行器，所以按源码路径取 core 的公共出口，
// 而不是给根工程再加一条 workspace 依赖。
import { applyScreenDocumentCommand } from '../../packages/core/src/index.js';

/**
 * 画布背景的能力一致性。
 *
 * 回归的是一个**不会报错**的 bug：契约早就支持线性/径向渐变，`update-canvas` 也接受
 * `background`，但智能体的工具 schema 与宿主编译器各自维护了一份"背景只有纯色"的子集，
 * 于是"把背景改成渐变的天蓝色"被回答成"画布只支持纯色背景"——用户以为能力不存在。
 *
 * 三件事在这里被钉住：
 * 1. 模型看到的能力面 = 契约的能力面（`SCREEN_CANVAS_BACKGROUND_TYPES` 逐类型比对）；
 * 2. 每种形态都能从一句中文走到文档里（后端规则 → 宿主编译 → core 校验）；
 * 3. 契约新增形态时，本测试直接红——而不是等用户撞上"不支持"。
 *
 * 后端是 CJS 且刻意不依赖契约包，所以这一层绑定只能放在根级 Vitest（同
 * `agent-flow-contract.test.ts` 的做法）。渲染侧已由
 * `packages/renderer/tests/renderer/renderer-presentation.test.ts` 覆盖。
 */

const DOCUMENT: ScreenDocument = {
  canvas: { width: 1920, height: 1080, backgroundColor: '#0b1020' },
  components: [],
  variables: [],
  blueprint: { relations: [] },
};

/**
 * 每种契约形态一句中文 + 它应落到文档里的背景值。
 *
 * 用 `Record<ScreenCanvasBackgroundType, …>` 而不是数组：契约新增一种形态时，
 * 这里缺键会直接编译失败，逼着补齐"智能体怎么说得出它"。
 */
const SAMPLES: Record<
  ScreenCanvasBackgroundType,
  { readonly sentence: string; readonly expected: ScreenCanvasBackground }
> = {
  solid: {
    sentence: '把背景改成天蓝色',
    expected: { type: 'solid', color: '#87ceeb' },
  },
  'linear-gradient': {
    sentence: '把背景改成渐变的天蓝色',
    expected: {
      type: 'linear-gradient',
      angle: 180,
      stops: [
        { color: '#87ceeb', position: 0 },
        { color: '#6fa9c1', position: 100 },
      ],
    },
  },
  'radial-gradient': {
    sentence: '把背景改成径向渐变的深蓝色',
    expected: {
      type: 'radial-gradient',
      position: { x: 50, y: 50 },
      stops: [
        { color: '#16305c', position: 0 },
        { color: '#687895', position: 100 },
      ],
    },
  },
};

function agentPatch(sentence: string): AgentCanvasPatch {
  const patch = matchCanvasInstruction(sentence, {});
  if (patch === null) throw new Error(`智能体规则没认出来：「${sentence}」`);
  return patch;
}

/** 智能体侧纯色走 `backgroundColor`，渐变走 `background`：统一成契约的 background 形态比对。 */
function asBackground(patch: AgentCanvasPatch): ScreenCanvasBackground {
  if (patch.background !== undefined && patch.background !== null) return patch.background;
  if (patch.backgroundColor !== undefined) {
    return { type: 'solid', color: patch.backgroundColor };
  }
  throw new Error('这个 patch 里没有背景填充');
}

describe('canvas background capability parity', () => {
  it('shows the model exactly the background types the contract supports', () => {
    expect([...AGENT_CANVAS_BACKGROUND_TYPES]).toEqual([...SCREEN_CANVAS_BACKGROUND_TYPES]);

    const typeSchema = AGENT_CANVAS_BACKGROUND_SCHEMA.properties.type as {
      readonly enum: readonly string[];
    };
    expect([...typeSchema.enum]).toEqual([...SCREEN_CANVAS_BACKGROUND_TYPES]);
  });

  it('has a sentence for every contract background type, and the rule understands it', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual([...SCREEN_CANVAS_BACKGROUND_TYPES].sort());

    for (const type of SCREEN_CANVAS_BACKGROUND_TYPES) {
      const background = asBackground(agentPatch(SAMPLES[type].sentence));
      expect(background.type).toBe(type);
      // 智能体自己产出的值必须先过契约：不能靠 core 拒绝来发现"说得出但写不进去"。
      expect(isScreenCanvasBackground(background)).toBe(true);
      expect(background).toEqual(SAMPLES[type].expected);
    }
  });

  it('carries every type into the document through the host compiler and core', () => {
    for (const type of SCREEN_CANVAS_BACKGROUND_TYPES) {
      const patch = agentPatch(SAMPLES[type].sentence);
      const compiled = compileCanvasCommands(DOCUMENT, patch);
      // 宿主丢弃字段的后果是"画布已经是你说的样子"，所以这里断言它必须编译出命令。
      expect(compiled.ok).toBe(true);
      if (!compiled.ok) continue;

      const applied = applyScreenDocumentCommand(DOCUMENT, compiled.commands[0]);
      expect(applied.ok).toBe(true);
      expect(applied.document.canvas.background).toEqual(SAMPLES[type].expected);
    }
  });

  it('treats the same type as applied once the document already shows it', () => {
    for (const type of SCREEN_CANVAS_BACKGROUND_TYPES) {
      const patch = agentPatch(SAMPLES[type].sentence);
      const compiled = compileCanvasCommands(DOCUMENT, patch);
      if (!compiled.ok) throw new Error(`${type} 没有被宿主编译出来`);
      const applied = applyScreenDocumentCommand(DOCUMENT, compiled.commands[0]);
      if (!applied.ok) throw new Error(`${type} 没被 core 接受`);

      // 后端：同一句话在已成事实的文档上不是变更。
      expect(matchCanvasInstruction(SAMPLES[type].sentence, applied.document.canvas)).toBeNull();
      // 宿主：拿到同样的 patch 也不该产出命令（否则用户会看到"提案为空"的失败）。
      expect(compileCanvasCommands(applied.document, patch)).toEqual({
        ok: false,
        problem: 'unchanged',
      });
    }
  });

  it('lets an explicit gradient win over a fallback solid colour in the same patch', () => {
    const gradient = SAMPLES['linear-gradient'].expected;
    const compiled = compileCanvasCommands(DOCUMENT, {
      background: gradient,
      backgroundColor: '#ffffff',
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const applied = applyScreenDocumentCommand(DOCUMENT, compiled.commands[0]);
    // 底色只是兜底值，不能把同一 patch 里明确要求的渐变顶掉。
    expect(applied.document.canvas.background).toEqual(gradient);
  });

  it('rejects a background the contract would refuse instead of silently ignoring it', () => {
    const unsorted: ScreenCanvasBackground = {
      type: 'linear-gradient',
      angle: 180,
      stops: [
        { color: '#87ceeb', position: 60 },
        { color: '#ffffff', position: 20 },
      ],
    };

    expect(isScreenCanvasBackground(unsorted)).toBe(false);
    expect(compileCanvasCommands(DOCUMENT, { background: unsorted })).toEqual({
      ok: false,
      problem: 'invalid',
    });
  });
});
