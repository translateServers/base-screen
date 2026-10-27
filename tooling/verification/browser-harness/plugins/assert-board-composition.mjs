// 宿主组合路径端到端：计时器触发、脚本过滤器、推送数据。
//
// 三条路径此前只写在调研文档的散文里——"计时器可用定时器 + 变量组合""脚本过滤器可用
// processorId + 宿主资产组合""推送走写变量而不是资源端口"。散文无法证明组合真的成立，
// 于是这里把三条都跑一遍：真正启动宿主定时器、真正经 processorId 路由、真正写入变量，
// 并断言蓝图规则被变量事件触发。任何一环断开（端口形状不对、事件不发、动作未声明）
// 都会在这里失败，而不是等到宿主集成时才发现。

const COMPOSITION_PLUGIN_ID = 'harness.board-composition';
const SCRIPT_PROCESSOR_ID = 'hostScriptFilter';
const TICK_VARIABLE_ID = 'harness-tick';
const SCRIPT_VARIABLE_ID = 'harness-script-filter';
const SPOTLIGHT_ACTION_ID = 'plugin.pipeline.spotlight';

async function waitForDocument(page) {
  await page.waitForFunction(() => window.baseScreenHarness.designer.document !== undefined);
}

// 路径一：计时器触发。宿主自建定时器 → 写变量 → 变量 data-updated → 蓝图规则 → 插件动作。
export async function assertHostTimerComposition(page) {
  await waitForDocument(page);
  const wired = await page.evaluate(
    ([pluginId, processorId, tickVariableId, actionId]) => {
      const harness = window.baseScreenHarness;
      const designer = harness.designer;
      const index = harness.pluginManager.snapshot.contributions;
      const relation = designer.document.blueprint.relations.find(
        (item) => item.id === 'variable-trigger-demo',
      );
      return {
        // 插件必须真的进了快照：preflight 因能力未授权或 handler 缺失会整插件排除，
        // 只断言变量写成功会漏掉"处理器从未被路由到"这类断线。
        pluginCatalogued: harness.pluginManager.snapshot.plugins.get(pluginId) !== undefined,
        processorIndexed: index.getDataProcessor?.(processorId) !== undefined,
        ruleTrigger:
          relation?.type === 'behavior' && relation.source.kind === 'variable'
            ? 'variable-event'
            : null,
        ruleVariableId:
          relation?.type === 'behavior' && relation.source.kind === 'variable'
            ? relation.source.variableId
            : null,
        ruleActionId:
          relation?.type === 'behavior' && relation.effect.type === 'host-action'
            ? relation.effect.actionId
            : null,
        variableDeclared: designer.document.variables.some(
          (variable) => variable.id === tickVariableId,
        ),
      };
    },
    [COMPOSITION_PLUGIN_ID, SCRIPT_PROCESSOR_ID, TICK_VARIABLE_ID, SPOTLIGHT_ACTION_ID],
  );
  if (!wired.pluginCatalogued || !wired.processorIndexed) {
    throw new Error(`BROWSER_HARNESS_COMPOSITION_PLUGIN_NOT_CATALOGUED:${JSON.stringify(wired)}`);
  }
  if (
    wired.ruleTrigger !== 'variable-event' ||
    wired.ruleVariableId !== TICK_VARIABLE_ID ||
    wired.ruleActionId !== SPOTLIGHT_ACTION_ID ||
    wired.variableDeclared !== true
  ) {
    throw new Error(`BROWSER_HARNESS_COMPOSITION_RULE_NOT_WIRED:${JSON.stringify(wired)}`);
  }

  // 启动宿主定时器，观察到变量真的被写入、蓝图动作真的被执行后停止。
  const observed = await page.evaluate(
    async ([tickVariableId, actionId]) => {
      const harness = window.baseScreenHarness;
      const actionsBefore = harness.pluginActionRequests.length;
      harness.startBoardTick(20);
      await new Promise((resolve) => setTimeout(resolve, 260));
      harness.stopBoardTick();
      const requests = harness.pluginActionRequests.slice(actionsBefore);
      return {
        value: harness.designer.getVariable(tickVariableId)?.value ?? null,
        writes: harness.boardVariableWrites.length,
        actions: requests.length,
        // 端到端必须落到声明动作本身：只数"有动作"会漏掉 id 丢失（例如宿主动作端口的
        // 字段名写错，actionId 变成 undefined）这种"看起来触发了、其实全被拒绝"的失败。
        spotlightActions: requests.filter((request) => request.actionId === actionId).length,
      };
    },
    [TICK_VARIABLE_ID, SPOTLIGHT_ACTION_ID],
  );

  if (typeof observed.value !== 'number' || observed.value < 1) {
    throw new Error(`BROWSER_HARNESS_COMPOSITION_TIMER_NOT_WRITING:${JSON.stringify(observed)}`);
  }
  if (observed.writes < 2) {
    throw new Error(`BROWSER_HARNESS_COMPOSITION_TIMER_NOT_OBSERVED:${JSON.stringify(observed)}`);
  }
  // 定时器每次都写新值（tick 递增），因此动作次数应与写入次数同量级；只断言 > 0
  // 会漏掉"第一次之后就不再触发"这类断线。
  if (observed.actions < 2 || observed.spotlightActions < 2) {
    throw new Error(`BROWSER_HARNESS_COMPOSITION_TIMER_NOT_TRIGGERING:${JSON.stringify(observed)}`);
  }
}

// 路径二：用户可编写过滤器。文档只存 processorId，脚本正文留在宿主资产表。
export async function assertHostScriptProcessorComposition(page) {
  await waitForDocument(page);
  const routed = await page.evaluate(
    async ([scriptVariableId, processorId]) => {
      const harness = window.baseScreenHarness;
      const variable = harness.designer.document.variables.find(
        (item) => item.id === scriptVariableId,
      );
      // 阈值 800：上游三行里只有两行超过，处理器必须真的把第三行滤掉。
      harness.setBoardScriptRows([
        { name: '上海', amount: 982 },
        { name: '深圳', amount: 871 },
        { name: '北京', amount: 763 },
      ]);
      harness.setBoardScript('overThreshold', { field: 'amount', threshold: 800 });
      harness.designer.refreshVariables({ variableIds: [scriptVariableId] });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const first = harness.designer.getVariable(scriptVariableId)?.value ?? null;
      // 换脚本只改宿主侧的 scriptId 与参数：文档不动，同一个 processorId 立刻走另一套变换。
      harness.setBoardScript('renameField', { from: 'amount', to: 'value' });
      harness.designer.refreshVariables({ variableIds: [scriptVariableId] });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const second = harness.designer.getVariable(scriptVariableId)?.value ?? null;
      // 未知脚本标识必须失败关闭，而不是静默退回原值。
      const rejected = await harness.pluginManager.applyDataProcessor({
        processorId,
        value: [{ amount: 1 }],
        config: { scriptId: 'missingScriptAsset' },
      });
      return {
        processorIdInDocument: variable?.processorId ?? null,
        first,
        second,
        rejectedOk: rejected.ok,
        rejectedCode: rejected.ok ? null : (rejected.diagnostics[0]?.code ?? null),
      };
    },
    [SCRIPT_VARIABLE_ID, SCRIPT_PROCESSOR_ID],
  );

  if (routed.processorIdInDocument !== SCRIPT_PROCESSOR_ID) {
    throw new Error(`BROWSER_HARNESS_COMPOSITION_PROCESSOR_NOT_BOUND:${JSON.stringify(routed)}`);
  }
  const filtered = routed.first;
  if (!Array.isArray(filtered) || filtered.length !== 2) {
    throw new Error(
      `BROWSER_HARNESS_COMPOSITION_SCRIPT_NOT_APPLIED:${JSON.stringify(routed.first)}`,
    );
  }
  const renamed = routed.second;
  if (
    !Array.isArray(renamed) ||
    renamed.length !== 3 ||
    renamed.some((row) => !Object.hasOwn(row, 'value') || Object.hasOwn(row, 'amount'))
  ) {
    throw new Error(
      `BROWSER_HARNESS_COMPOSITION_SCRIPT_NOT_SWAPPED:${JSON.stringify(routed.second)}`,
    );
  }
  if (routed.rejectedOk) {
    throw new Error(
      `BROWSER_HARNESS_COMPOSITION_UNKNOWN_SCRIPT_ACCEPTED:${JSON.stringify(routed)}`,
    );
  }
  if (routed.rejectedCode !== 'HOST_RESOURCE_UNAVAILABLE') {
    throw new Error(`BROWSER_HARNESS_COMPOSITION_UNKNOWN_SCRIPT_CODE:${JSON.stringify(routed)}`);
  }
}

// 路径三：推送数据。宿主自有触发源（服务端推送）写变量，与资源端口无关。
export async function assertHostPushComposition(page) {
  await waitForDocument(page);
  const pushed = await page.evaluate(
    async ([tickVariableId]) => {
      const harness = window.baseScreenHarness;
      const actionsBefore = harness.pluginActionRequests.length;
      const result = harness.pushBoardVariable(4242);
      await new Promise((resolve) => setTimeout(resolve, 60));
      // 推送不走资源端口：请求-响应语义（deadline + generation guard）属于一次性取数，
      // 在这里造轮询会同时破坏宿主与引擎两侧的假设。
      return {
        ok: result.ok,
        value: harness.designer.getVariable(tickVariableId)?.value ?? null,
        actions: harness.pluginActionRequests.length - actionsBefore,
      };
    },
    [TICK_VARIABLE_ID],
  );

  if (!pushed.ok || pushed.value !== 4242) {
    throw new Error(`BROWSER_HARNESS_COMPOSITION_PUSH_NOT_WRITTEN:${JSON.stringify(pushed)}`);
  }
  // 推送同样要触发蓝图规则：写入路径与计时器完全一致，差别只在触发源。
  if (pushed.actions < 1) {
    throw new Error(`BROWSER_HARNESS_COMPOSITION_PUSH_NOT_TRIGGERING:${JSON.stringify(pushed)}`);
  }
}
