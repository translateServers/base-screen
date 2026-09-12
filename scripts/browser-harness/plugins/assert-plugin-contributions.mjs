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
