// 插件承载面：外围插件贡献的物料、数据资源类型与蓝图能力。
// 这三项此前只有声明、没有端到端验证：插件贡献的物料没并入设计器目录（渲染不到），
// 数据资源类型与蓝图能力则靠 harness 里复刻的一份字面量索引撑场面。本模块对着
// manager 快照与真实 UI 断言"声明 → 授权 → 渲染/可选/可用"确实接通了。

const ECHARTS_COMPONENT_ID = 'plugin-echarts-demo';
const ECHARTS_COMPONENT_TYPE = 'plugin.echarts';
const ECHARTS_TAG = 'base-screen-plugin-echarts';
const METRICS_RESOURCE_TYPE = 'metricsSummary';
// base.image 声明了 host-resource 数据能力，是宿主资源作者入口的合法物料载体。
const RESOURCE_PROBE_TYPE = 'base.image';

async function waitForDocument(page) {
  await page.waitForFunction(() => window.baseScreenHarness.designer.document !== undefined);
}

// 插件贡献的物料必须真的进入设计器目录并渲染出元素——这是 plugin-echarts 此前
// 声明了但从未生效的那一环。同时断言它不是宿主自营物料，避免断言被目录里的副本蒙对。
export async function assertPluginMaterialRenders(designer, page) {
  await waitForDocument(page);

  const entered = await page.evaluate(
    ([id, type]) => {
      const harness = window.baseScreenHarness;
      const inDesignerCatalog = harness.catalog.has(type);
      const result = harness.designer.executeCommand({
        type: 'add-component',
        component: {
          id,
          type,
          name: 'Plugin ECharts demo',
          parentId: null,
          position: { x: 80, y: 500 },
          size: { width: 420, height: 240 },
          rotation: 0,
          zIndex: 30,
          status: { locked: false, hidden: false },
          props: { titleText: 'plugin', showTooltip: true, seriesType: 'line' },
          style: { backgroundColor: '#111827', color: '#f9fafb', gridColor: '#374151', opacity: 1 },
          dataSource: {
            type: 'static',
            value: {
              series: [
                {
                  id: 's1',
                  label: 'series',
                  points: [
                    { x: 'a', y: 1 },
                    { x: 'b', y: 2 },
                  ],
                },
              ],
            },
          },
        },
      });
      return { inDesignerCatalog, ok: result.ok, diagnostics: result.diagnostics };
    },
    [ECHARTS_COMPONENT_ID, ECHARTS_COMPONENT_TYPE],
  );

  if (entered.inDesignerCatalog !== true) {
    throw new Error('BROWSER_HARNESS_PLUGIN_MATERIAL_NOT_IN_CATALOG');
  }
  if (entered.ok !== true) {
    throw new Error(
      `BROWSER_HARNESS_PLUGIN_MATERIAL_ADD_FAILED:${JSON.stringify(entered.diagnostics)}`,
    );
  }

  const rendered = await page.evaluate(
    ([id, tag]) => {
      const harness = window.baseScreenHarness;
      const node = harness.designer.shadowRoot.querySelector(
        `[data-base-screen-component-id=${id}]`,
      );
      // 该插件物料不用 Shadow DOM，ECharts 直接画进元素的 light DOM（div + canvas）。
      const element = node !== null && node.matches(tag) ? node : null;
      const host = element?.querySelector('[_echarts_instance_]') ?? null;
      const canvas = host?.querySelector('canvas') ?? null;
      return {
        hostPresent: node !== null,
        elementPresent: element !== null,
        chartHostPresent: host !== null,
        canvasPresent: canvas !== null,
        catalogType:
          harness.designer.document.components.find((item) => item.id === id)?.type ?? null,
      };
    },
    [ECHARTS_COMPONENT_ID, ECHARTS_TAG],
  );

  if (!rendered.hostPresent || !rendered.elementPresent || !rendered.chartHostPresent) {
    throw new Error(`BROWSER_HARNESS_PLUGIN_MATERIAL_NOT_RENDERED:${JSON.stringify(rendered)}`);
  }
  // 真图表实例会在宿主 div 里挂 canvas；只挂上自定义元素但没真的渲染图表时这里会失败。
  if (!rendered.canvasPresent) {
    throw new Error(`BROWSER_HARNESS_PLUGIN_MATERIAL_NOT_DRAWN:${JSON.stringify(rendered)}`);
  }

  await page.evaluate(
    (id) =>
      window.baseScreenHarness.designer.executeCommand({
        type: 'remove-components',
        componentIds: [id],
      }),
    ECHARTS_COMPONENT_ID,
  );
}

// 插件贡献的数据资源类型必须被引擎真正消费：它既要在贡献索引里可枚举，
// 也要能通过宿主资源作者入口（insertHostResource 经 getResourceType 判定）放行，
// 而未知类型必须被拒绝。只断言索引可枚举不足以证明这条承载面接通。
export async function assertPluginResourceTypeSelectable(designer, page) {
  await waitForDocument(page);

  const index = await page.evaluate((resourceType) => {
    const contributions = window.baseScreenHarness.pluginManager.snapshot.contributions;
    return {
      listed: (contributions.listResourceTypes?.() ?? []).map((item) => item.id),
      resolved: contributions.getResourceType(resourceType) !== undefined,
      schemaRequired: contributions.getResourceType(resourceType)?.configSchema?.required ?? null,
    };
  }, METRICS_RESOURCE_TYPE);
  if (!index.resolved || !index.listed.includes(METRICS_RESOURCE_TYPE)) {
    throw new Error(`BROWSER_HARNESS_PLUGIN_RESOURCE_TYPE_NOT_LISTED:${JSON.stringify(index)}`);
  }
  // configSchema 的必填字段来自插件声明；引擎据此校验宿主资源参数。
  if (index.schemaRequired?.join(',') !== 'metric,window') {
    throw new Error(`BROWSER_HARNESS_PLUGIN_RESOURCE_SCHEMA_FAILED:${JSON.stringify(index)}`);
  }

  const authoring = await page.evaluate(
    ([resourceType, materialType]) => {
      const harness = window.baseScreenHarness;
      const accepted = harness.designer.insertHostResource({
        materialType,
        name: 'Plugin metrics probe',
        dataSource: {
          type: 'host-resource',
          resourceType,
          resourceId: 'harness-metrics',
          params: {
            metric: { kind: 'literal', value: 'cpu' },
            window: { kind: 'literal', value: 'week' },
          },
          binding: null,
        },
      });
      const rejected = harness.designer.insertHostResource({
        materialType,
        name: 'Unknown type probe',
        dataSource: {
          type: 'host-resource',
          resourceType: 'noSuchResourceType',
          resourceId: 'harness-metrics',
          params: {},
          binding: null,
        },
      });
      const inserted = accepted.ok
        ? harness.designer.document.components.find(
            (item) => item.dataSource?.resourceType === resourceType,
          )
        : undefined;
      if (inserted !== undefined) {
        harness.designer.executeCommand({
          type: 'remove-components',
          componentIds: [inserted.id],
        });
      }
      return {
        accepted: accepted.ok,
        acceptedCodes: accepted.diagnostics.map((item) => item.code),
        rejected: rejected.ok,
        rejectedCodes: rejected.diagnostics.map((item) => item.code),
        insertedResourceType: inserted?.dataSource?.resourceType ?? null,
      };
    },
    [METRICS_RESOURCE_TYPE, RESOURCE_PROBE_TYPE],
  );

  if (!authoring.accepted || authoring.insertedResourceType !== METRICS_RESOURCE_TYPE) {
    throw new Error(
      `BROWSER_HARNESS_PLUGIN_RESOURCE_TYPE_NOT_AUTHORABLE:${JSON.stringify(authoring)}`,
    );
  }
  // 反向：未知资源类型必须失败关闭，否则"可枚举"可能只是宿主放行了一切。
  if (authoring.rejected) {
    throw new Error(
      `BROWSER_HARNESS_PLUGIN_RESOURCE_TYPE_UNKNOWN_ACCEPTED:${JSON.stringify(authoring)}`,
    );
  }
}

// 插件声明的蓝图能力必须能被引擎的蓝图模型认可：能力由插件（而非宿主）给出时，
// 依赖该能力的规则才可用。断言的是"插件提供了能力"，不是"宿主放行了自己"。
export async function assertPluginBlueprintCapability(page) {
  await waitForDocument(page);
  const state = await page.evaluate(() => {
    const harness = window.baseScreenHarness;
    const contributions = harness.pluginManager.snapshot.contributions;
    const capability = 'blueprint.action.request-component-data';
    return {
      granted: contributions.hasBlueprintCapability(capability),
      owner: harness.pluginManager.snapshot.plugins
        .list()
        .filter((plugin) =>
          plugin.contributions.some(
            (item) => item.kind === 'blueprintCapability' && item.id === capability,
          ),
        )
        .map((plugin) => plugin.manifest.id),
    };
  });
  if (!state.granted) {
    throw new Error('BROWSER_HARNESS_PLUGIN_BLUEPRINT_CAPABILITY_NOT_GRANTED');
  }
  // 该能力应归属外围插件，而不是宿主自营 fixture——否则断言不能证明插件通道。
  if (state.owner.join() !== 'base-screen.metrics') {
    throw new Error(
      `BROWSER_HARNESS_PLUGIN_BLUEPRINT_CAPABILITY_OWNER_FAILED:${JSON.stringify(state)}`,
    );
  }
}

// 大屏组件插件（plugin-datav-materials）：零第三方依赖的渲染类插件，四个物料 + 自有
// 检查器控件 + 一条事务命令。这里覆盖三条只有真实插件才成立的性质：
//   1. 物料真的渲染出各自的 DOM 结构（不是只有自定义元素壳）；
//   2. 插件自有的检查器控件被授权实例化，且写回可撤销；
//   3. 插件命令读选区、按现值轮换样式、进 history。
// 只断言"物料进了目录"会漏掉元素 render 抛异常或渲染成空白这类问题。
const DATAV_FLOP_TYPE = 'datav.digital-flop';
const DATAV_WATER_LEVEL_TYPE = 'datav.water-level';
const DATAV_BORDER_TYPE = 'datav.border-box';
const DATAV_FLOP_TAG = 'base-screen-datav-digital-flop';
const DATAV_WATER_LEVEL_TAG = 'base-screen-datav-water-level';
const DATAV_BORDER_TAG = 'base-screen-datav-border-box';
const DATAV_BORDER_PICKER_TAG = 'base-screen-datav-border-picker';
const DATAV_CYCLE_COMMAND = 'base-screen.datav.cycle-border-style';
const DATAV_FLOP_POSITION = { x: 60, y: 400 };
const DATAV_WATER_POSITION = { x: 400, y: 60 };
const DATAV_BORDER_POSITION = { x: 60, y: 60 };

// 用公开作者入口插入：`insertComponent` 按 manifest 默认值展开 size/props/style/dataSource，
// 因此断言不会因手写的 style 与物料 schema 漂移而失败——那本身就是宿主该走的路径。
async function insertDatavComponent(page, materialType, name, position) {
  return page.evaluate(
    (intent) => {
      const result = window.baseScreenHarness.designer.insertComponent(intent);
      return { ok: result.ok, diagnostics: result.diagnostics };
    },
    { materialType, name, position },
  );
}

// 插入后取回新组件的 id（insertComponent 会把它设为唯一选中项）。
async function readFocusedId(page) {
  return page.evaluate(() => window.baseScreenHarness.designer.selection.focusedComponentId);
}

async function removeComponent(page, id) {
  await page.evaluate(
    (componentId) =>
      window.baseScreenHarness.designer.executeCommand({
        type: 'remove-components',
        componentIds: [componentId],
      }),
    id,
  );
}

async function readProps(page, id) {
  return page.evaluate(
    (componentId) =>
      window.baseScreenHarness.designer.document.components.find((item) => item.id === componentId)
        ?.props ?? null,
    id,
  );
}

/**
 * 把 borderStyle 设为指定值。
 *
 * `update-components` 的 `props` 是整体替换（引擎的检查器写回也是算出一份完整 props 再提交），
 * 所以这里必须先在当前 props 上覆盖，而不是只给一个 `{ borderStyle }` 的新对象——
 * 后者会把 schema 必填的 bracketSize/lineWidth/showTitleBar 一起抹掉，事务被拒。
 */
async function setBorderStyle(page, id, borderStyle) {
  return page.evaluate(
    (value) => {
      const designer = window.baseScreenHarness.designer;
      const component = designer.document.components.find((item) => item.id === value.id);
      const result = designer.executeCommand({
        type: 'update-components',
        componentIds: [value.id],
        patch: { props: { ...component.props, borderStyle: value.borderStyle } },
      });
      return { ok: result.ok, diagnostics: result.diagnostics };
    },
    { id, borderStyle },
  );
}

// 通道一：插件贡献的物料进入目录并渲染出各自的内部结构。
export async function assertDatavMaterialsRender(designer, page) {
  await waitForDocument(page);

  const catalogued = await page.evaluate(
    (types) => types.map((type) => window.baseScreenHarness.catalog.has(type)),
    [DATAV_FLOP_TYPE, DATAV_WATER_LEVEL_TYPE, DATAV_BORDER_TYPE],
  );
  if (catalogued.some((present) => present !== true)) {
    throw new Error(`BROWSER_HARNESS_DATAV_NOT_IN_CATALOG:${JSON.stringify(catalogued)}`);
  }

  const flop = await insertDatavComponent(page, DATAV_FLOP_TYPE, '翻牌器探针', DATAV_FLOP_POSITION);
  if (!flop.ok) {
    throw new Error(`BROWSER_HARNESS_DATAV_ADD_FAILED:${JSON.stringify(flop.diagnostics)}`);
  }
  const flopId = await readFocusedId(page);
  if (flopId === null) throw new Error('BROWSER_HARNESS_DATAV_FLOP_NOT_SELECTED');

  const rendered = await page.evaluate(
    ([id, flopTag]) => {
      const designer = window.baseScreenHarness.designer;
      const node = designer.shadowRoot.querySelector(`[data-base-screen-component-id=${id}]`);
      const element = node !== null && node.matches(flopTag) ? node : null;
      const digits = element?.querySelectorAll('[data-datav-flop-digit]') ?? [];
      const component = designer.document.components.find((item) => item.id === id);
      const rect = element?.getBoundingClientRect();
      // 位移/缩放都是 1:1，所以渲染盒应当与声明尺寸一致（容许亚像素取整误差）。
      // 物料若在 renderMaterial 里改写宿主元素 width/height（例如写成 100%），
      // 就会覆盖渲染器写下的像素尺寸，这里立刻暴露。
      const canvas = designer.shadowRoot.querySelector('[data-canvas]')?.getBoundingClientRect();
      return {
        elementPresent: element !== null,
        // manifest 默认读数 128430 拆成 6 位数字格；只渲染外壳而没走到数字排版时这里是 0。
        digitCount: digits.length,
        digitsText: [...digits].map((cell) => cell.textContent).join(''),
        declared:
          component === undefined ? null : { w: component.size.width, h: component.size.height },
        rendered: rect === undefined ? null : { w: rect.width, h: rect.height },
        canvas: canvas === undefined ? null : { w: canvas.width, h: canvas.height },
      };
    },
    [flopId, DATAV_FLOP_TAG],
  );
  if (!rendered.elementPresent || rendered.digitCount !== 6 || rendered.digitsText !== '128430') {
    throw new Error(`BROWSER_HARNESS_DATAV_NOT_RENDERED:${JSON.stringify(rendered)}`);
  }
  const { declared, rendered: box } = rendered;
  if (declared === null || box === null) {
    throw new Error(`BROWSER_HARNESS_DATAV_GEOMETRY_MISSING:${JSON.stringify(rendered)}`);
  }
  if (Math.abs(box.w - declared.w) > 1 || Math.abs(box.h - declared.h) > 1) {
    throw new Error(
      `BROWSER_HARNESS_DATAV_SIZE_MISMATCH:${JSON.stringify({ declared, box, canvas: rendered.canvas })}`,
    );
  }

  await removeComponent(page, flopId);

  // 水位图：读数必须真的可见——水体与读数同为绝对定位，append 顺序反了就会被盖住。
  // 用 elementFromPoint 在中心点取最上层元素，能直接判定"读数被压在下面"这类层级错误。
  const water = await insertDatavComponent(
    page,
    DATAV_WATER_LEVEL_TYPE,
    '水位图探针',
    DATAV_WATER_POSITION,
  );
  if (!water.ok) {
    throw new Error(`BROWSER_HARNESS_DATAV_WATER_ADD_FAILED:${JSON.stringify(water.diagnostics)}`);
  }
  const waterId = await readFocusedId(page);
  if (waterId === null) throw new Error('BROWSER_HARNESS_DATAV_WATER_NOT_SELECTED');
  const waterState = await page.evaluate(
    ([id, tag]) => {
      const designer = window.baseScreenHarness.designer;
      const node = designer.shadowRoot.querySelector(`[data-base-screen-component-id=${id}]`);
      const element = node !== null && node.matches(tag) ? node : null;
      const label = element?.querySelector('[data-datav-water-label]') ?? null;
      const tank = element?.querySelector('[data-datav-water-tank]') ?? null;
      const fill = element?.querySelector('[data-datav-water-fill]') ?? null;
      const labelRect = label?.getBoundingClientRect();
      const topmost =
        labelRect === undefined
          ? null
          : (element?.ownerDocument ?? document)
              .elementFromPoint(
                labelRect.left + labelRect.width / 2,
                labelRect.top + labelRect.height / 2,
              )
              ?.closest('[data-datav-water-label], [data-datav-water-fill]')
              ?.getAttribute('data-datav-water-label') !== null;
      return {
        elementPresent: element !== null,
        tankPresent: tank !== null,
        fillPresent: fill !== null,
        labelText: label?.textContent ?? null,
        // 液面高度是内联百分比样式，直接据此判断读数有没有落进液面。
        fillHeight: fill instanceof HTMLElement ? fill.style.height : null,
        labelOnTop: topmost,
      };
    },
    [waterId, DATAV_WATER_LEVEL_TAG],
  );
  if (
    !waterState.elementPresent ||
    !waterState.tankPresent ||
    !waterState.fillPresent ||
    waterState.labelText !== '68.5%'
  ) {
    throw new Error(`BROWSER_HARNESS_DATAV_WATER_NOT_RENDERED:${JSON.stringify(waterState)}`);
  }
  if (waterState.labelOnTop !== true) {
    throw new Error(`BROWSER_HARNESS_DATAV_WATER_LABEL_HIDDEN:${JSON.stringify(waterState)}`);
  }
  await removeComponent(page, waterId);
}

// 通道二：插件为自家物料贡献的检查器控件被授权实例化，写回进 props 事务且可撤销。
export async function assertDatavInspectorControl(designer, page) {
  await waitForDocument(page);

  const added = await insertDatavComponent(
    page,
    DATAV_BORDER_TYPE,
    '边框探针',
    DATAV_BORDER_POSITION,
  );
  if (!added.ok) {
    throw new Error(`BROWSER_HARNESS_DATAV_BORDER_ADD_FAILED:${JSON.stringify(added.diagnostics)}`);
  }
  const borderId = await readFocusedId(page);
  if (borderId === null) throw new Error('BROWSER_HARNESS_DATAV_BORDER_NOT_SELECTED');
  // 从 manifest 默认值出发：控件当前选中项必须与文档值一致，才谈得上"读到当前值"。
  const initialProps = await readProps(page, borderId);
  const initialStyle =
    typeof initialProps?.borderStyle === 'string' ? initialProps.borderStyle : null;
  if (initialStyle === null) {
    throw new Error(`BROWSER_HARNESS_DATAV_BORDER_DEFAULT_MISSING:${JSON.stringify(initialProps)}`);
  }

  // insertComponent 只按默认值建节点；把边框改成 plain，让后续轮换从确定状态出发。
  const preset = await setBorderStyle(page, borderId, 'plain');
  if (!preset.ok) {
    throw new Error(
      `BROWSER_HARNESS_DATAV_BORDER_PRESET_FAILED:${JSON.stringify(preset.diagnostics)}`,
    );
  }

  await designer.getByRole('tab', { name: '图层' }).click();
  await designer.locator(`[data-layer-select=${borderId}]`).click({ force: true });
  await page.waitForFunction(
    (id) => window.baseScreenHarness.designer.selection.focusedComponentId === id,
    borderId,
  );
  await designer.locator('[data-inspector-tab="appearance"]').click();

  const readControl = () =>
    page.evaluate(
      ([tag, id]) => {
        const designer = window.baseScreenHarness.designer;
        const component = designer.document.components.find((item) => item.id === id);
        const control = designer.shadowRoot.querySelector(tag);
        return {
          borderStyle: component?.props?.borderStyle ?? null,
          controlRendered: control !== null,
          // 归属只用于诊断：授权来自 inspectorControl 贡献，不是宿主的注册表。
          owner: control?.dataset?.descriptorCustomOwner ?? null,
          pressed: control
            ? [...control.shadowRoot.querySelectorAll('[data-border-choice]')]
                .filter((button) => button.getAttribute('aria-pressed') === 'true')
                .map((button) => button.dataset.borderChoice)
            : [],
        };
      },
      [DATAV_BORDER_PICKER_TAG, borderId],
    );

  const initial = await readControl();
  if (
    !initial.controlRendered ||
    initial.owner !== 'base-screen.datav-materials' ||
    initial.pressed.join() !== 'plain'
  ) {
    throw new Error(`BROWSER_HARNESS_DATAV_CONTROL_FAILED:${JSON.stringify(initial)}`);
  }

  await designer.locator(`${DATAV_BORDER_PICKER_TAG} [data-border-choice="notch"]`).click({
    timeout: 15_000,
    force: true,
  });
  await page.waitForFunction(
    ([id]) =>
      window.baseScreenHarness.designer.document.components.find((c) => c.id === id)?.props
        ?.borderStyle === 'notch',
    [borderId],
  );
  const written = await readControl();
  if (written.pressed.join() !== 'notch') {
    throw new Error(`BROWSER_HARNESS_DATAV_CONTROL_WRITE_FAILED:${JSON.stringify(written)}`);
  }
  // 边框形态必须真的落到渲染上：样式只写在控件里、没进元素 dataset 的话这里会失败。
  const frameStyle = await page.evaluate(
    ([id, tag]) => {
      const node = window.baseScreenHarness.designer.shadowRoot.querySelector(
        `[data-base-screen-component-id=${id}]`,
      );
      return node !== null && node.matches(tag) ? (node.dataset.datavBorderStyle ?? null) : null;
    },
    [borderId, DATAV_BORDER_TAG],
  );
  if (frameStyle !== 'notch') {
    throw new Error(`BROWSER_HARNESS_DATAV_BORDER_NOT_REPAINTED:${frameStyle}`);
  }

  await page.evaluate(() => window.baseScreenHarness.designer.undo());
  await page.waitForFunction(
    ([id]) =>
      window.baseScreenHarness.designer.document.components.find((c) => c.id === id)?.props
        ?.borderStyle === 'plain',
    [borderId],
  );
  const undone = await readControl();
  if (undone.pressed.join() !== 'plain') {
    throw new Error(`BROWSER_HARNESS_DATAV_CONTROL_UNDO_FAILED:${JSON.stringify(undone)}`);
  }

  await removeComponent(page, borderId);
}

// 通道三：插件命令经命令面板触发，读选区、按现值轮换、提交可撤销事务。
export async function assertDatavCycleCommand(designer, page) {
  await waitForDocument(page);

  const added = await insertDatavComponent(
    page,
    DATAV_BORDER_TYPE,
    '边框探针',
    DATAV_BORDER_POSITION,
  );
  if (!added.ok) {
    throw new Error(`BROWSER_HARNESS_DATAV_CYCLE_ADD_FAILED:${JSON.stringify(added.diagnostics)}`);
  }
  const borderId = await readFocusedId(page);
  if (borderId === null) throw new Error('BROWSER_HARNESS_DATAV_CYCLE_NOT_SELECTED');
  const preset = await setBorderStyle(page, borderId, 'plain');
  if (!preset.ok) {
    throw new Error(
      `BROWSER_HARNESS_DATAV_CYCLE_PRESET_FAILED:${JSON.stringify(preset.diagnostics)}`,
    );
  }

  await designer.getByRole('tab', { name: '图层' }).click();
  await designer.locator(`[data-layer-select=${borderId}]`).click({ force: true });
  await page.waitForFunction(
    (id) => window.baseScreenHarness.designer.selection.focusedComponentId === id,
    borderId,
  );

  const borderStyle = () =>
    page.evaluate(
      (id) =>
        window.baseScreenHarness.designer.document.components.find((c) => c.id === id)?.props
          ?.borderStyle ?? null,
      borderId,
    );

  const runCycle = async () => {
    await designer.locator('[data-command-palette-toggle]').click();
    await designer.locator('[data-command-palette-search]').fill(DATAV_CYCLE_COMMAND);
    const entry = designer.locator(
      `[data-command-palette-result][data-plugin-command="${DATAV_CYCLE_COMMAND}"]`,
    );
    if ((await entry.count()) !== 1 || (await entry.isDisabled())) {
      throw new Error('BROWSER_HARNESS_DATAV_COMMAND_ENTRY_FAILED');
    }
    await entry.click();
  };

  // plain → corner-brackets → double-line（声明顺序）；连跑两次才能证明"按现值轮换"而非写死。
  await runCycle();
  await page.waitForFunction(
    (id) =>
      window.baseScreenHarness.designer.document.components.find((c) => c.id === id)?.props
        ?.borderStyle === 'corner-brackets',
    borderId,
  );
  await runCycle();
  await page.waitForFunction(
    (id) =>
      window.baseScreenHarness.designer.document.components.find((c) => c.id === id)?.props
        ?.borderStyle === 'double-line',
    borderId,
  );

  // 两次提交都在 history 里，两次 undo 必须逐次退回 plain。
  await page.evaluate(() => window.baseScreenHarness.designer.undo());
  const afterFirstUndo = await borderStyle();
  if (afterFirstUndo !== 'corner-brackets') {
    throw new Error(`BROWSER_HARNESS_DATAV_COMMAND_UNDO_STEP_FAILED:${afterFirstUndo}`);
  }
  await page.evaluate(() => window.baseScreenHarness.designer.undo());
  const afterSecondUndo = await borderStyle();
  if (afterSecondUndo !== 'plain') {
    throw new Error(`BROWSER_HARNESS_DATAV_COMMAND_UNDO_FAILED:${afterSecondUndo}`);
  }

  await removeComponent(page, borderId);
}
