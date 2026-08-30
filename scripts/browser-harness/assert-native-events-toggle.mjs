async function assertNativeEventsToggle(designer, page) {
  const toggle = designer.locator('[data-status-toggle="native-events"]');
  if ((await toggle.getAttribute('aria-checked')) !== 'false') {
    throw new Error('BROWSER_HARNESS_NATIVE_EVENTS_TOGGLE_INITIAL_STATE_FAILED');
  }
  const baseline = await page.evaluate(() => window.baseScreenHarness.designerNativeEvents.length);
  // 关闭时点击画布文本组件：设计态只做编辑，不产生宿主事件。
  await designer.evaluate(() => {
    const canvas = window.baseScreenHarness.designer.shadowRoot.querySelector('[data-canvas]');
    canvas
      ?.querySelector('[data-base-screen-component-id="title"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
  });
  const countOff = await page.evaluate(() => window.baseScreenHarness.designerNativeEvents.length);
  if (countOff !== baseline) {
    throw new Error('BROWSER_HARNESS_NATIVE_EVENTS_OFF_LEAK_FAILED');
  }

  await toggle.click();
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    throw new Error('BROWSER_HARNESS_NATIVE_EVENTS_TOGGLE_ON_FAILED');
  }

  // 开启后同一点击转发为宿主 base-screen-material-event（与 Viewer 同形）。
  await designer.evaluate(() => {
    const canvas = window.baseScreenHarness.designer.shadowRoot.querySelector('[data-canvas]');
    canvas
      ?.querySelector('[data-base-screen-component-id="title"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
  });
  const forwarded = await page.evaluate(() => window.baseScreenHarness.designerNativeEvents.at(-1));
  if (
    forwarded?.componentId !== 'title' ||
    forwarded?.type !== 'base.text' ||
    forwarded?.name !== 'valueClick'
  ) {
    throw new Error(`BROWSER_HARNESS_NATIVE_EVENTS_FORWARD_FAILED:${JSON.stringify(forwarded)}`);
  }

  // 关闭后事件再次被门控，状态恢复初始值。
  await toggle.click();
  if ((await toggle.getAttribute('aria-checked')) !== 'false') {
    throw new Error('BROWSER_HARNESS_NATIVE_EVENTS_TOGGLE_OFF_AGAIN_FAILED');
  }
  const countAfterOff = await page.evaluate(
    () => window.baseScreenHarness.designerNativeEvents.length,
  );
  await designer.evaluate(() => {
    const canvas = window.baseScreenHarness.designer.shadowRoot.querySelector('[data-canvas]');
    canvas
      ?.querySelector('[data-base-screen-component-id="title"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
  });
  const finalCount = await page.evaluate(
    () => window.baseScreenHarness.designerNativeEvents.length,
  );
  if (finalCount !== countAfterOff) {
    throw new Error('BROWSER_HARNESS_NATIVE_EVENTS_OFF_AFTER_TOGGLE_FAILED');
  }

  // 覆盖全部官方交互物料（text/chart/echarts/table）的探针设计器：同一「事件」开关在
  // 真实浏览器里对全部 element（含 React/Vue 桥接）端到端生效；探针在单个异步 evaluate 内
  // 创建、交互并移除，不污染主设计器的文档、历史与后续断言。
  const probe = await page.evaluate(async () => {
    const { catalog, materialManifests } = window.baseScreenHarness;
    // React 桥接的初始提交与交互模式重渲染是异步的，交互前等待一个事件循环轮次。
    const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
    const probeElement = document.createElement('base-screen-designer');
    const probeEvents = [];
    probeElement.addEventListener('base-screen-material-event', (event) =>
      probeEvents.push(event.detail),
    );
    const component = (id, manifestKey, position, dataSource) => ({
      id,
      type: materialManifests[manifestKey].type,
      name: id,
      parentId: null,
      position,
      size: { ...materialManifests[manifestKey].defaultSize },
      rotation: 0,
      zIndex: 0,
      status: { locked: false, hidden: false },
      props: structuredClone(materialManifests[manifestKey].defaultProps),
      style: structuredClone(materialManifests[manifestKey].defaultStyle),
      dataSource,
    });
    const chartValue = {
      fields: [
        { id: 'category', label: '区域', valueType: 'string', nullable: false },
        { id: 'amount', label: '金额', valueType: 'number', nullable: false },
      ],
      rows: [{ category: 'north', amount: 42 }],
    };
    const chartBinding = { fields: { dimension: ['category'], measures: ['amount'] } };
    const tableValue = {
      fields: [{ id: 'amount', label: '金额', valueType: 'number', nullable: false }],
      rows: [{ amount: 42 }],
    };
    probeElement.catalog = catalog;
    probeElement.document = {
      canvas: { width: 960, height: 540, backgroundColor: '#0b1220' },
      components: [
        component('probe-text', 'text', { x: 20, y: 20 }, { type: 'static', value: '探针文本' }),
        component(
          'probe-chart',
          'chart',
          { x: 20, y: 100 },
          {
            type: 'static',
            value: chartValue,
            binding: chartBinding,
          },
        ),
        component(
          'probe-echarts',
          'echarts',
          { x: 340, y: 100 },
          {
            type: 'static',
            value: chartValue,
            binding: chartBinding,
          },
        ),
        component(
          'probe-table',
          'table',
          { x: 660, y: 100 },
          {
            type: 'static',
            value: tableValue,
            binding: { fields: { columns: ['amount'] } },
          },
        ),
        component('probe-react', 'react', { x: 20, y: 300 }, null),
        component('probe-vue', 'vue', { x: 240, y: 300 }, null),
      ],
      variables: [],
      blueprint: { rules: [] },
    };
    document.body.appendChild(probeElement);
    await tick();
    const canvas = probeElement.shadowRoot.querySelector('[data-canvas]');
    // React 桥接初始提交是异步的：轮询等待两个桥接按钮挂载完成（最多约 1s），
    // 避免偶发慢提交导致关闭态断言在按钮就绪前执行。
    const bridgeReady = async () => {
      for (let attempt = 0; attempt < 50; attempt++) {
        const reactButton = canvas.querySelector(
          '[data-base-screen-component-id="probe-react"] button',
        );
        const vueButton = canvas.querySelector(
          '[data-base-screen-component-id="probe-vue"] button',
        );
        if (reactButton !== null && vueButton !== null) return true;
        await tick();
      }
      return false;
    };
    if (!(await bridgeReady())) return { bridgeTimeout: true };
    const dispatch = (componentId, selector) => {
      const target = canvas.querySelector(
        selector === null
          ? `[data-base-screen-component-id="${componentId}"]`
          : `[data-base-screen-component-id="${componentId}"] ${selector}`,
      );
      if (target === null || target === undefined) return false;
      target.dispatchEvent(
        new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }),
      );
      return true;
    };
    const matches = (expected) => {
      const actual = probeEvents.at(-1);
      return (
        actual !== undefined &&
        actual.componentId === expected.componentId &&
        actual.type === expected.type &&
        actual.name === expected.name
      );
    };
    // 原生 CSS 交互探针：echarts 圆点的 pointer 光标与 mouseenter 放大同样受开关门控。
    const hoverCheck = () => {
      const circle = canvas.querySelector('[data-base-screen-component-id="probe-echarts"] circle');
      if (circle === null || circle === undefined) return null;
      const before = circle.getAttribute('r');
      const cursor = circle.style.cursor;
      circle.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, composed: true }));
      const after = circle.getAttribute('r');
      return { before, after, cursor };
    };
    // 桥接原生 button 的 CSS 交互门控：关闭时 pointer-events 为 none（hover/active/focus 静默），
    // 开启后恢复 auto。
    const bridgeStyle = (componentId) => {
      const button = canvas.querySelector(
        `[data-base-screen-component-id="${componentId}"] button`,
      );
      return button === null || button === undefined
        ? null
        : getComputedStyle(button).pointerEvents;
    };

    // 初始（开关关闭）：各类 element 点击均零事件，hover 无效果，桥接按钮无指针交互。
    const silentTargets = [
      dispatch('probe-text', null),
      dispatch('probe-chart', 'circle'),
      dispatch('probe-echarts', 'circle'),
      dispatch('probe-table', 'tbody tr'),
      dispatch('probe-table', 'td'),
    ];
    const silentCount = probeEvents.length;
    const hoverOff = hoverCheck();
    const bridgeOff = { react: bridgeStyle('probe-react'), vue: bridgeStyle('probe-vue') };
    const bridgeSilentTargets = [
      dispatch('probe-react', 'button'),
      dispatch('probe-vue', 'button'),
    ];
    const bridgeSilentCount = probeEvents.length;

    // 开启：每类 element 的原生事件按 manifest 声明转发到宿主，hover 与桥接按钮交互恢复。
    probeElement.shadowRoot.querySelector('[data-status-toggle="native-events"]').click();
    await tick();
    const results = {
      text:
        dispatch('probe-text', null) &&
        matches({ componentId: 'probe-text', type: 'base.text', name: 'valueClick' }),
      chart:
        dispatch('probe-chart', 'circle') &&
        matches({ componentId: 'probe-chart', type: 'base.chart', name: 'pointClick' }),
      echarts:
        dispatch('probe-echarts', 'circle') &&
        matches({ componentId: 'probe-echarts', type: 'base.echarts', name: 'seriesClick' }),
      row:
        dispatch('probe-table', 'tbody tr') &&
        matches({ componentId: 'probe-table', type: 'base.table', name: 'rowClick' }),
      cell:
        dispatch('probe-table', 'td') &&
        matches({ componentId: 'probe-table', type: 'base.table', name: 'cellClick' }),
      bridgeReact:
        dispatch('probe-react', 'button') &&
        matches({
          componentId: 'probe-react',
          type: 'harness.react-button',
          name: 'valueClick',
        }),
      bridgeVue:
        dispatch('probe-vue', 'button') &&
        matches({ componentId: 'probe-vue', type: 'harness.vue-button', name: 'valueClick' }),
    };
    const hoverOn = hoverCheck();
    const bridgeOn = { react: bridgeStyle('probe-react'), vue: bridgeStyle('probe-vue') };
    const onCount = probeEvents.length;

    // 关闭：各类 element 再次全部静默（含 hover 与桥接按钮指针交互），开关恢复初始值。
    probeElement.shadowRoot.querySelector('[data-status-toggle="native-events"]').click();
    await tick();
    const again = dispatch('probe-text', null);
    const bridgeAfterOff = { react: bridgeStyle('probe-react'), vue: bridgeStyle('probe-vue') };
    const offCount = probeEvents.length;
    const toggleOff = probeElement.shadowRoot
      .querySelector('[data-status-toggle="native-events"]')
      .getAttribute('aria-checked');
    probeElement.remove();
    return {
      silentTargets,
      silentCount,
      hoverOff,
      bridgeOff,
      bridgeSilentTargets,
      bridgeSilentCount,
      results,
      hoverOn,
      bridgeOn,
      onCount,
      offCount,
      bridgeAfterOff,
      again,
      toggleOff,
    };
  });
  if (
    probe.bridgeTimeout === true ||
    probe.silentTargets.some((hit) => hit !== true) ||
    probe.silentCount !== 0 ||
    probe.hoverOff === null ||
    probe.hoverOff.before !== probe.hoverOff.after ||
    probe.hoverOff.cursor !== '' ||
    probe.bridgeOff.react !== 'none' ||
    probe.bridgeOff.vue !== 'none' ||
    probe.bridgeSilentTargets.some((hit) => hit !== true) ||
    probe.bridgeSilentCount !== 0 ||
    probe.toggleOff !== 'false' ||
    !probe.results.text ||
    !probe.results.chart ||
    !probe.results.echarts ||
    !probe.results.row ||
    !probe.results.cell ||
    !probe.results.bridgeReact ||
    !probe.results.bridgeVue ||
    probe.hoverOn === null ||
    probe.hoverOn.before === probe.hoverOn.after ||
    probe.hoverOn.after !== '2' ||
    probe.hoverOn.cursor !== 'pointer' ||
    probe.bridgeOn.react !== 'auto' ||
    probe.bridgeOn.vue !== 'auto' ||
    probe.onCount !== 7 ||
    probe.offCount !== probe.onCount ||
    probe.bridgeAfterOff.react !== 'none' ||
    probe.bridgeAfterOff.vue !== 'none' ||
    probe.again !== true
  ) {
    throw new Error(`BROWSER_HARNESS_NATIVE_EVENTS_ELEMENTS_FAILED:${JSON.stringify(probe)}`);
  }
}

export { assertNativeEventsToggle };
