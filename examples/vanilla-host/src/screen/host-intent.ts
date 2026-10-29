import type { ScreenDocument } from '@base-screen/contracts';
import { parseScreenDocument } from '@base-screen/contracts';
import type { BaseScreenDesignerElement } from '@base-screen/sdk/designer';
import type { DesignerChangeProposalInput, DesignerIntentHandler } from '@base-screen/sdk/engine';
import { showToast } from '../components/toast';
import { api } from '../lib/api';
import { createLogger } from '../lib/logger';

const logger = createLogger('host-intent');

/** 引擎公开的提案命令联合：从提案入参上取，避免示例再依赖一份 core 类型副本。 */
type ProposalCommand = DesignerChangeProposalInput['commands'][number];

export interface HostIntentOptions {
  readonly designer: BaseScreenDesignerElement;
  /** 当前大屏 id：只用于日志，提案本身不落库。 */
  readonly screenId: string;
}

/**
 * 示例接线：把设计器右栏的「意图书写面」接到示例智能体 `POST /agent/generate`。
 *
 * 引擎侧只做三件事——把「一句话 + 作用域」结构化后交出来、如实回显结果、把宿主产出的
 * 提案挂成幽灵草案。模型调用、凭证、传输全在这里；`setIntentHandler` 之前输入区是
 * 停用态并写明「当前环境未接入智能体」，本模块就是让它可用起来的那一段。
 *
 * 结果落点走引擎既有通道 `submitChangeProposal`：不直接改文档、不进历史，用户在
 * 草案条/变更页签里逐条采纳后才作为一次普通事务写入。示例后端每次生成会**新建一张屏**，
 * 这里不消费那张新屏的 id，只把它的 document 当成「整屏候选内容」编译成命令，
 * 因此原屏不会被悄悄改写，也不会因为一次误提交就丢掉当前设计。
 */
export function createHostIntentHandler(options: HostIntentOptions): DesignerIntentHandler {
  return async (request, signal) => {
    // 示例后端只按主题生成整屏，不理解「改选中组件」这件事。作用域是组件时不猜、
    // 也不偷偷扩成整屏——直接说明原因，让用户先解除作用域。
    if (request.scope.kind !== 'screen') {
      showToast('示例智能体只支持整屏生成，请先解除作用域再提交。', 'info');
      return { ok: false, diagnostics: [] };
    }

    // 只记长度与实例，不记输入正文：日志不该成为指令内容的第二份存储。
    logger.debug('intent dispatch', options.screenId, request.text.length);
    const generated = await api.generateScreen(request.text, signal);
    if (!generated.ok) {
      logger.warn('agent generate failed', generated.error);
      showToast(describeFailure(generated.error.message), 'error');
      return { ok: false, diagnostics: [] };
    }

    // 后端把 document 当不透明 JSON 存，前端才是权威校验点：结构不合法的候选永不进草案。
    const parsed = parseScreenDocument(generated.data.screen.document);
    if (!parsed.ok) {
      logger.warn('agent document rejected', parsed.diagnostics);
      showToast('智能体返回的大屏文档结构不合法，未生成变更。', 'error');
      return { ok: false, diagnostics: parsed.diagnostics };
    }

    const current = options.designer.getDocument();
    if (current === undefined) {
      showToast('设计器尚未加载文档，稍后重试。', 'error');
      return { ok: false, diagnostics: [] };
    }

    const commands = compileWholeScreenCommands(current, parsed.value);

    const submitted = options.designer.submitChangeProposal({
      title: `智能体生成：${truncate(request.text, 18)}`,
      // 理由只陈述可核对的事实：谁生成的、走的是模型还是确定性兜底、影响范围。
      rationale: `示例智能体按主题生成整屏（${describeMode(generated.data.mode)}），布局由后端确定性编译；本轮以整屏替换的形式作为候选，未写入文档。${describeLocked(current)}`,
      scope: '整屏',
      commands,
      origin: { author: '示例智能体' },
    });
    if (!submitted.ok) {
      // 拒绝原因的两种来源：命令事务不成立（诊断非空），或幽灵草案渲染失败（引擎内部
      // 不把渲染诊断透出来，这里只能给出笼统结论并在控制台留日志）。
      logger.warn('change proposal rejected', submitted.diagnostics);
      showToast('提案被引擎拒绝（命令或渲染校验未通过），未生成变更。', 'error');
      return { ok: false, diagnostics: submitted.diagnostics };
    }

    // 结果进入变更而非直接生效：这里只报告「生成了什么」，不假装已经改完。
    showToast(
      `已生成整屏提案（${describeMode(generated.data.mode)}），结果在「变更」里逐条采纳。`,
      'success',
    );
    return { ok: true, value: null, diagnostics: [] };
  };
}

/**
 * 把「整屏候选文档」编译成一次可试算的提案命令。
 *
 * 引擎没有「整份替换文档」的命令：替换必须拆成画布、组件、变量、蓝图四类。
 * - 锁定组件**不删**：引擎会以 `CORE_COMMAND_TARGET_LOCKED` 拒绝整批删除，而锁定本来就是
 *   宿主给「这段不许动」的表达，智能体不该绕过它——保留原位，候选只覆盖未锁定的部分；
 * - 新组件 zIndex 接在当前最大值之后，生成内容整体落在保留内容之上；
 * - 变量与蓝图只在真的不同时才整体替换：这两处被保留的锁定组件可能仍在引用，
 *   无脑写入 `[]` 只会得到一份校验不通过的候选。
 */
function compileWholeScreenCommands(
  current: ScreenDocument,
  next: ScreenDocument,
): readonly ProposalCommand[] {
  const commands: ProposalCommand[] = [
    {
      type: 'update-canvas',
      patch: {
        width: next.canvas.width,
        height: next.canvas.height,
        backgroundColor: next.canvas.backgroundColor,
      },
    },
  ];

  const removable = current.components
    .filter((component) => !component.status.locked)
    .map((component) => component.id);
  if (removable.length > 0) commands.push({ type: 'remove-components', componentIds: removable });

  const zIndexBase = current.components.reduce(
    (max, component) => Math.max(max, component.zIndex),
    0,
  );
  for (const component of next.components) {
    commands.push({
      type: 'add-component',
      component: { ...component, zIndex: component.zIndex + zIndexBase },
    });
  }

  if (JSON.stringify(current.variables) !== JSON.stringify(next.variables)) {
    commands.push({ type: 'replace-variables', variables: next.variables });
  }
  if (JSON.stringify(current.blueprint) !== JSON.stringify(next.blueprint)) {
    commands.push({ type: 'replace-blueprint', blueprint: next.blueprint });
  }
  return commands;
}

/** 锁定组件被跳过时如实写进理由：用户在变更卡上要能看见「为什么还留着几个旧组件」。 */
function describeLocked(current: ScreenDocument): string {
  const locked = current.components.filter((component) => component.status.locked);
  if (locked.length === 0) return '';
  const names = locked.map((component) => component.name).join('、');
  return `锁定组件（${names}）按原样保留，未被替换。`;
}

function describeMode(mode: 'llm' | 'deterministic'): string {
  return mode === 'llm' ? '模型输出' : '确定性兜底 · 未调用模型';
}

function describeFailure(message: string): string {
  return message === '' ? '智能体生成失败，未产生变更。' : message;
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}
