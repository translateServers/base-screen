# 物料公共加载容器

加载视图与加载容器由 `@base-screen/plugin-sdk` 拥有，`@base-screen/material` 与
`@base-screen/sdk/material` 按原名 re-export（外围插件只能依赖 `contracts`、`plugin-core`、
`plugin-sdk`，所以归属在 plugin-sdk）。它负责默认加载展示、显隐、无障碍和内容保留，不发起查询，
不修改 Renderer，也不强制其他物料采用相同刷新策略。

## 非 ready 态的统一呈现

官方物料与宿主物料的非 `ready` 态都交给 `@base-screen/plugin-sdk` 的状态视图，兜底文案只有这一份
（依据 [ADR-0086](./decisions/ADR-0086-material-state-and-surface-ownership.md)）：

- `createBaseScreenMaterialStateView(ownerDocument, dataState)`：`ready` 返回 `undefined` 由物料画
  自己的内容；`loading` 用本文件的 loading 视图；`error` 以 `role="alert"` 呈现 contracts 侧已脱敏
  限长的 `message`，并把 `code` 写进 `data-base-screen-material-error-code`；`idle` 表示"还没发起
  请求"，占满同一个盒子但**不给任何文案**。
- `createBaseScreenMaterialEmptyView(ownerDocument)`：数据已 `ready` 但没有行——"查过了，没有结果"，
  与 `idle` 区分。
- `createBaseScreenMaterialErrorView(ownerDocument, code, message)`：数据 `ready` 但形状不符合**本物料**
  契约时使用，文案由物料给出（如"表格数据格式无效"），chrome 与上面完全一致。

四个状态填充同一个盒子，切换不产生位移；视图只在自己的子节点上写 `width/height: 100%`，不写宿主
宽高、不依赖宿主 `display`（渲染器按可见性强制 `none`/`block`）。

## 接入

```ts
import { createBaseScreenMaterialLoadingContainer } from '@base-screen/material';

const loading = createBaseScreenMaterialLoadingContainer(mount.ownerDocument, {
  label: '数据加载中',
});
loading.element.append(content);
mount.append(loading.element);

// 在物料接收 model 时调用；不要另建 loading 状态或请求。
loading.update(model.dataState);

// 可按当前启动阶段更新纯文本提示；不重建容器或内容。
loading.update({ status: 'loading' }, { label: '等待启动' });

// 卸载时调用，不清空调用方持有的 content。
loading.dispose();
```

`mount` 是物料内部稳定尺寸的挂载点，不是 Designer 设置画布位置和尺寸的物料根元素；`content` 由
物料自己创建和更新。Vue 可用 Teleport 将内容渲染到 `loading.element`，其他框架可使用各自的 portal
或原生 DOM；不要把 DOM、框架组件或回调写进 Manifest、ScreenDocument。

容器只观察只读 `status`。`loading` 时覆盖显示默认加载界面，内容变为不可交互并隐藏，但不删除、
移动或重新创建内容节点；其他状态恢复内容。支持公共 idle/loading/ready/error，以及物料从 ready
数据派生的展示 empty。empty 不成为新的 canonical 数据态。错误/空态的业务解释仍由物料负责。

update 的第二参数沿用 `{ label?: string }`，省略时恢复创建容器时的标签，默认“加载中”。标签只按
纯文本渲染。未知状态或非字符串标签在修改界面前抛出 TypeError；标签变更不重建内容或加载节点。
dispose 幂等，移除容器、隐藏加载界面，后续 update 不再生效。
工厂只使用传入的 ownerDocument；导入和创建都不注册 Custom Element，不访问全局 document，不启动
定时器、观察器或请求。需要保留旧图表或局部刷新的物料可以不使用此容器，避免出现两处加载展示。

## 样式定制

CSS 变量可从宿主继承；同一元素上的声明优先于祖先，不影响其他容器实例。

| CSS 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `--base-screen-loading-color` | inherit | 文字和转圈颜色 |
| `--base-screen-loading-background` | transparent | 加载层背景 |
| `--base-screen-loading-border` | 0 solid transparent | 加载层边框 |
| `--base-screen-loading-radius` | 0 | 圆角 |
| `--base-screen-loading-padding` | 0 | 内边距 |
| `--base-screen-loading-font-size` | inherit | 提示字号 |
| `--base-screen-loading-gap` | 8px | 图标和文字间距 |
| `--base-screen-loading-spinner-size` | 18px | 图标尺寸 |
| `--base-screen-loading-spinner-width` | 2px | 图标线宽 |
| `--base-screen-loading-duration` | 900ms | 动画周期 |

容器公开 `content`、`loading`、`loading-spinner`、`loading-label` 四个 part。宿主可用公开 part 做
附加样式，不依赖内部 class 或私有 Shadow DOM。例子：

```css
.my-material {
  --base-screen-loading-color: #a7f3d0;
  --base-screen-loading-background: #123322;
  --base-screen-loading-spinner-size: 26px;
}
.my-material [data-base-screen-material-loading-container]::part(loading-label) {
  font-weight: 700;
}
```

定制样式仍须保持固定几何，不改变 loading/ready 的容器尺寸；不要覆盖隐藏/inert 行为或添加状态触发
的边框增宽。默认动画尊重 `prefers-reduced-motion: reduce`。本轮不提供替换 loading 内容的插槽。

已有 `createBaseScreenMaterialLoadingElement` 仍可单独使用，支持同一组 CSS 变量及 `spinner`、`label`
两个 part；它只提供展示节点，不管理加载状态。选择公共容器后，无需再手动切换这个展示节点。
