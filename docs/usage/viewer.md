# 加载文档与嵌入 Viewer

> 返回[宿主使用指南](../usage.md)。

## 加载和校验文档

从 API、数据库、文件或 URL 得到的值都视为不可信输入，进入 Viewer/Designer 前使用
`parseScreenDocument()`：

```ts
import { parseScreenDocument } from '@base-screen/contracts';

const response = await fetch('/api/screens/sales');
const parsed = parseScreenDocument(await response.json());
if (!parsed.ok) {
  showDiagnostics(parsed.diagnostics);
  throw new Error('Screen Document 无效');
}

const screenDocument = parsed.value;
```

解析器会拒绝未知字段和无效结构。宿主不要自行剥离未知字段、补默认值、转换类型或回退到
猜测的文档形态。

宿主自行构造文档时也建议在开发和导入边界执行同一解析器。最小文档包含 `canvas`、
`components`、`variables` 和 `blueprint`：

```ts
const parsed = parseScreenDocument({
  canvas: { width: 1920, height: 1080, backgroundColor: '#111827' },
  components: [],
  variables: [],
  blueprint: { rules: [] },
});
if (!parsed.ok) throw new Error('Screen Document 无效');
const emptyDocument = parsed.value;
```

## 嵌入 Viewer

Viewer 按 Screen Document 的 `canvas.width` / `canvas.height` 渲染像素画布，不会自动缩放到宿主
容器。宿主必须明确选择原始像素、`contain` 或 `cover` 策略。

原始像素模式适合有滚动条的编辑预览或宿主本身已保证相同尺寸：

```html
<div class="screen-stage">
  <base-screen-viewer></base-screen-viewer>
</div>
```

```css
.screen-stage,
base-screen-viewer {
  display: block;
  min-height: 0;
}

.screen-stage {
  width: 100%;
  height: 100%;
  overflow: auto;
}

base-screen-viewer {
  width: 1920px;
  height: 1080px;
}
```

推荐使用 `configure()` 一次性提交运行时依赖，再单独设置文档：

```ts
import type { ScreenDiagnostic } from '@base-screen/contracts';
import { type BaseScreenViewerElement, defineBaseScreenViewer } from '@base-screen/sdk/viewer';

const viewerDefinition = defineBaseScreenViewer();
if (!viewerDefinition.ok) throw new Error('Viewer 注册失败');

const viewer = document.querySelector<BaseScreenViewerElement>('base-screen-viewer');
if (viewer === null) throw new Error('缺少 base-screen-viewer');

viewer.addEventListener('base-screen-diagnostic', (event) => {
  const detail = (event as CustomEvent<{ diagnostics: readonly ScreenDiagnostic[] }>).detail;
  reportBaseScreenDiagnostics(detail.diagnostics);
});

const configured = viewer.configure({
  catalog,
  instanceId: 'sales-published-viewer',
  mode: 'viewer',
  resourceTimeoutMs: 15_000,
});
if (!configured.ok) {
  showDiagnostics(configured.diagnostics);
  throw new Error('Viewer 配置失败');
}

viewer.document = screenDocument;
```

`configure()` 会在创建 Renderer 前原子校验整个配置。不要依赖多个 setter 的先后顺序完成
初始化。运行中可以重新设置 `document`；`catalog`、资源端口、变量端口、contribution 和
timeout 等运行时依赖需要先 `unload()`，再重新 `configure()`。诊断监听应在配置和文档赋值前
注册，避免漏掉初始化阶段的错误。

### `contain` / `cover` 自适应

发布页需要等比自适应时，在 Viewer 外增加固定画布层，由宿主缩放该层。下面的实现同步完成首次
计算，后续只更新 `transform`，不会改变文档坐标或向 Screen Document 写入视口状态：

```html
<div class="screen-viewport">
  <div class="screen-canvas">
    <base-screen-viewer></base-screen-viewer>
  </div>
</div>
```

```css
.screen-viewport {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  contain: layout paint;
}

.screen-canvas {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0);
  transform-origin: center;
}

.screen-canvas > base-screen-viewer {
  display: block;
  width: 100%;
  height: 100%;
}
```

```ts
function observeScreenFit(
  viewport: HTMLElement,
  canvas: HTMLElement,
  size: { width: number; height: number },
  mode: 'contain' | 'cover' = 'contain',
): () => void {
  if (size.width <= 0 || size.height <= 0) throw new RangeError('画布尺寸必须大于 0');

  const update = () => {
    const scaleX = viewport.clientWidth / size.width;
    const scaleY = viewport.clientHeight / size.height;
    const scale = mode === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
    canvas.style.transform = `translate(-50%, -50%) scale(${scale})`;
  };

  canvas.style.width = `${size.width}px`;
  canvas.style.height = `${size.height}px`;
  update();
  const observer = new ResizeObserver(update);
  observer.observe(viewport);
  return () => observer.disconnect();
}

const viewport = document.querySelector<HTMLElement>('.screen-viewport');
const canvas = document.querySelector<HTMLElement>('.screen-canvas');
if (viewport === null || canvas === null) throw new Error('缺少 Viewer 自适应容器');

const stopFit = observeScreenFit(viewport, canvas, screenDocument.canvas, 'contain');
// 路由离开或销毁页面时调用 stopFit()。
```

`contain` 完整展示并可能留边；`cover` 填满容器并可能裁切。尺寸变化、全屏和横竖屏调度属于
宿主。避免给 `base-screen-viewer` 自身设置百分比尺寸后期待它自动改变画布坐标系。

数据变化时可刷新全部资源或单个组件：

```ts
viewer.refreshData();
viewer.refreshData('sales-chart');
viewer.refreshData({
  componentId: 'sales-chart',
  trigger: 'polling',
  traceId: crypto.randomUUID(),
});
```

轮询调度属于宿主。Base Screen 只执行本次有界刷新，不创建后台轮询器。
