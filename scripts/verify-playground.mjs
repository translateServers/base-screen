import { withViteBrowser } from './browser-verification.mjs';

await withViteBrowser(
  {
    configFile: 'examples/playground/vite.config.ts',
    root: 'examples/playground',
    server: { port: 4177 },
  },
  async ({ baseUrl, browser }) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const cases = [
      { path: '/', title: 'Vue 应用中的 Base Screen', state: 'ready', materials: 4 },
      {
        path: '/designer',
        title: '大屏设计器',
        state: 'ready',
        materials: 3,
        surface: 'designer',
      },
      { path: '/dataset', title: '宿主数据集运行时', state: 'ready', materials: 3 },
      { path: '/binding', title: '字段角色绑定', state: 'ready', materials: 3 },
      { path: '/errors', title: '安全失败状态', state: 'error', materials: 2 },
    ];

    for (const item of cases) {
      const pageErrors = [];
      page.once('pageerror', (error) => pageErrors.push(error));
      await page.goto(`${baseUrl}${item.path}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(
        ({ expectedMaterials, expectedState, surface }) => {
          const viewer = document.querySelector(
            surface === 'designer' ? '#playground-designer' : '#playground-viewer',
          );
          const materials = [
            ...(viewer?.shadowRoot?.querySelectorAll('[data-base-screen-component-id]') ?? []),
          ];
          return (
            materials.length === expectedMaterials &&
            materials.some(
              (element) => element.getAttribute('data-base-screen-data-state') === expectedState,
            )
          );
        },
        {
          expectedMaterials: item.materials,
          expectedState: item.state,
          surface: item.surface ?? 'viewer',
        },
      );
      if (pageErrors.length > 0) throw pageErrors[0];
      const actual = await page.evaluate(
        (surface) => ({
          title:
            surface === 'designer'
              ? document.querySelector('#playground-designer') === null
                ? undefined
                : '大屏设计器'
              : document.querySelector('h1')?.textContent,
          activeRoute:
            surface === 'designer'
              ? '/designer'
              : document.querySelector('.nav [aria-current="page"]')?.getAttribute('href'),
        }),
        item.surface ?? 'viewer',
      );
      if (actual.title !== item.title || actual.activeRoute !== item.path) {
        throw new Error(`PLAYGROUND_ROUTE_FAILED:${item.path}`);
      }
      if (item.path === '/designer') {
        const designer = await page.evaluate(() => {
          const element = document.querySelector('#playground-designer');
          const bounds = element?.getBoundingClientRect();
          return {
            present: element !== null,
            shell: document.querySelector('.shell') !== null,
            dataTab: element?.shadowRoot?.querySelector('[data-inspector-tab="data"]') !== null,
            hostResourceTab:
              element?.shadowRoot?.querySelector('[data-panel-tab="host:resources"]') !== null,
            hostLeftPanelGroups: element?.leftPanelGroups,
            hostResourcePanel: element?.querySelector('[data-host-resource-panel]') !== null,
            materialCards:
              element?.shadowRoot?.querySelectorAll('[data-material-card]').length ?? 0,
            runtime: window.playgroundRuntime !== undefined,
            fullScreen:
              bounds?.width === window.innerWidth && bounds?.height === window.innerHeight,
          };
        });
        if (
          !designer.present ||
          designer.shell ||
          !designer.dataTab ||
          !designer.hostResourceTab ||
          designer.hostLeftPanelGroups?.[0]?.id !== 'resources' ||
          !designer.hostResourcePanel ||
          designer.materialCards === 0 ||
          !designer.runtime ||
          !designer.fullScreen
        ) {
          throw new Error(`PLAYGROUND_DESIGNER_FAILED:${JSON.stringify(designer)}`);
        }
        const designerSurface = page.locator('#playground-designer');
        await designerSurface.locator('[data-panel-tab="host:resources"]').click();
        const hostResourceCard = page.locator(
          '#playground-designer > [data-host-resource-panel] [data-host-resource-id="dashboard-grid"]',
        );
        await hostResourceCard.click();
        await page
          .locator(
            '#playground-designer > [data-host-resource-panel] [data-host-resource-id="campaign-cover"]',
          )
          .focus();
        await page.keyboard.press('Tab');
        const hostPanelExperience = await designerSurface.evaluate((element) => {
          const root = element.shadowRoot;
          const panel = element.querySelector('[data-host-resource-panel]');
          const selected = panel?.querySelector('[data-host-resource-id="dashboard-grid"]');
          const slot = root?.querySelector(
            'slot[name="base-screen-designer-left-panel-resources"]',
          );
          const focused = document.activeElement;
          const focusStyle = focused instanceof HTMLElement ? getComputedStyle(focused) : undefined;
          return {
            assigned: slot?.assignedElements().includes(panel) === true,
            cardCount: panel?.querySelectorAll('[data-host-resource-id]').length ?? 0,
            collapsed: root?.querySelector('.designer')?.dataset.leftCollapsed,
            focusVisible:
              focused === selected &&
              focusStyle?.outlineStyle !== 'none' &&
              focusStyle?.outlineWidth !== '0px',
            panelVisible:
              root?.querySelector('.host-left-panel-view[data-host-left-panel-group="resources"]')
                ?.hidden === false,
            selected: selected?.getAttribute('aria-pressed'),
            status: panel?.querySelector('[data-host-resource-status]')?.textContent,
            tabSelected:
              root
                ?.querySelector('[data-panel-tab="host:resources"]')
                ?.getAttribute('aria-selected') === 'true',
          };
        });
        if (
          !hostPanelExperience.assigned ||
          hostPanelExperience.cardCount !== 3 ||
          hostPanelExperience.collapsed !== 'false' ||
          !hostPanelExperience.focusVisible ||
          !hostPanelExperience.panelVisible ||
          hostPanelExperience.selected !== 'true' ||
          hostPanelExperience.status !== '已选择：科技网格背景' ||
          !hostPanelExperience.tabSelected
        ) {
          throw new Error(
            `PLAYGROUND_HOST_RESOURCE_PANEL_FAILED:${JSON.stringify(hostPanelExperience)}`,
          );
        }
        await designerSurface.locator('[data-panel-tab="materials"]').click();
        await designerSurface.locator('[data-base-screen-component-id="designer-table"]').click();
        await designerSurface.locator('[data-inspector-tab="data"]').click();
        await designerSurface.locator('[data-dataset-descriptor]').waitFor();
        await designerSurface.locator('[data-dataset-change]').click();
        await designerSurface.locator('[data-dataset-resource-id="orders"]').waitFor();
        const catalogExperience = await designerSurface.evaluate((element) => ({
          connectedPorts:
            element.shadowRoot?.querySelectorAll(
              '.designer-host-connection-status[data-connected="true"]',
            ).length ?? 0,
        }));
        if (catalogExperience.connectedPorts !== 2) {
          throw new Error(
            `PLAYGROUND_DESIGNER_CATALOG_CONNECTION_FAILED:${JSON.stringify(catalogExperience)}`,
          );
        }
        await designerSurface.locator('[data-dataset-resource-id="orders"]').click();
        await designerSurface.locator('[data-dataset-descriptor]').waitFor();
        const dataExperience = await designerSurface.evaluate((element) => ({
          currentDataset:
            element.shadowRoot?.querySelector('[data-dataset-descriptor]')?.textContent ?? '',
          sourceModes:
            element.shadowRoot?.querySelector('[data-data-source-mode-select]')?.children.length ??
            0,
          roleCount:
            element.shadowRoot?.querySelectorAll('[data-dataset-binding-role]').length ?? 0,
          fieldButtons:
            element.shadowRoot?.querySelectorAll('[data-dataset-binding-field]').length ?? 0,
          nativeMultiple:
            element.shadowRoot?.querySelector('select[multiple][data-dataset-binding-role]') !==
            null,
          primaryAction:
            element.shadowRoot
              ?.querySelector('[data-dataset-action="apply"]')
              ?.getAttribute('data-variant') === 'primary',
          containedActions: (() => {
            const panel = element.shadowRoot?.querySelector('[data-inspector-pane="data"]');
            const bounds = panel?.getBoundingClientRect();
            return [...(element.shadowRoot?.querySelectorAll('[data-dataset-action]') ?? [])].every(
              (action) => {
                const actionBounds = action.getBoundingClientRect();
                return (
                  bounds !== undefined &&
                  actionBounds.left >= bounds.left &&
                  actionBounds.right <= bounds.right
                );
              },
            );
          })(),
        }));
        if (
          !dataExperience.currentDataset.includes('订单趋势') ||
          dataExperience.sourceModes !== 3 ||
          dataExperience.roleCount !== 1 ||
          dataExperience.fieldButtons !== 3 ||
          dataExperience.nativeMultiple ||
          !dataExperience.primaryAction ||
          !dataExperience.containedActions
        ) {
          throw new Error(
            `PLAYGROUND_DESIGNER_DATA_EXPERIENCE_FAILED:${JSON.stringify(dataExperience)}`,
          );
        }
        await designerSurface.locator('[data-data-source-mode-select]').selectOption('static');
        await designerSurface.locator('.designer-static-data-tabs').waitFor();
        await designerSurface.locator('[data-data-source-mode-select]').selectOption('dataset');
        await designerSurface.locator('[data-dataset-descriptor]').waitFor();
        await designerSurface.locator('[data-material-card="base.rectangle"]').click();
        await page.waitForFunction(() => {
          const designer = document.querySelector('#playground-designer');
          return (
            designer?.shadowRoot?.querySelector('[data-inspector-tab="data"]')?.hidden === true
          );
        });
      }
      if (item.path === '/dataset') {
        const controls = await page.evaluate(() => ({
          dataset: document.querySelector('select')?.value,
          viewer: document.querySelector('#playground-viewer') !== null,
          runtime: window.playgroundRuntime !== undefined,
        }));
        if (controls.dataset !== 'orders' || !controls.viewer || !controls.runtime) {
          throw new Error(`PLAYGROUND_VUE_RUNTIME_FAILED:${JSON.stringify(controls)}`);
        }
        await page.locator('select').nth(1).selectOption('south');
        await page.waitForFunction(() =>
          (document.querySelector('.request-list')?.textContent ?? '').includes('south'),
        );
        await page.getByRole('button', { name: '失败：关' }).click();
        await page.waitForFunction(() => {
          const viewer = document.querySelector('#playground-viewer');
          return [
            ...(viewer?.shadowRoot?.querySelectorAll('[data-base-screen-component-id]') ?? []),
          ].some((element) => element.getAttribute('data-base-screen-data-state') === 'error');
        });
      }
    }
  },
);
