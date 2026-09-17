# 框架桥接与宿主托管物料包

> 返回[宿主使用指南](../usage.md)。

## React、Vue 和自定义物料

React/Vue 应用可以把现有组件包装成 Base Screen 物料。Screen Document 仍只引用稳定的
material `type`，不保存框架组件名。`@base-screen/react` 要求 `react`、`react-dom` `^19.1.0`；
`@base-screen/vue` 要求 `vue` `^3.5.0`。框架依赖是 peer dependency，必须由宿主安装且全页只使用
兼容版本。

先提供一个冲突安全、可重复调用的注册函数：

```ts
import type { BaseScreenMaterialCatalogEntry } from '@base-screen/plugin-core';

function defineMaterialEntry(entry: BaseScreenMaterialCatalogEntry): void {
  const existing = customElements.get(entry.manifest.tagName);
  if (existing === undefined) {
    customElements.define(entry.manifest.tagName, entry.constructor);
    return;
  }
  if (existing !== entry.constructor) {
    throw new Error(`物料标签冲突：${entry.manifest.tagName}`);
  }
}
```

这段助手只负责把桥接产出的单个 catalog entry 注册成自定义元素。若要同时注册插件、物料包与面板/
控件元素，改用 `@base-screen/plugin-sdk` 的 `createPluginRegistration`（见[插件装配与贡献命令](./plugin-assembly.md)）：它按同一
冲突规则在第一个 `define()` 之前整体预检，并直接产出 `createBaseScreenPluginManager` 需要的输入。

React：

```ts
import { createReactMaterialDefinition } from '@base-screen/react';

const reactEntry = createReactMaterialDefinition({
  manifest,
  component: HostKpiCard,
  eventProps: { valueClick: 'onValueClick' },
});
if (!reactEntry.ok) {
  showDiagnostics(reactEntry.diagnostics);
  throw new Error('React 物料创建失败');
}
defineMaterialEntry(reactEntry.value);
```

Vue：

```ts
import { createVueMaterialDefinition } from '@base-screen/vue';

const vueEntry = createVueMaterialDefinition({
  manifest,
  component: HostKpiCard,
  eventProps: { valueClick: 'onValueClick' },
});
if (!vueEntry.ok) {
  showDiagnostics(vueEntry.diagnostics);
  throw new Error('Vue 物料创建失败');
}
defineMaterialEntry(vueEntry.value);
```

成功值是 `BaseScreenMaterialCatalogEntry`，可与官方物料 entry 一起传给
`createBaseScreenMaterialCatalog()`。`type` 和 `tagName` 必须稳定且唯一；不要每次组件渲染时创建
新的 bridge constructor。渲染器已经把 `component.size` 写成物料宿主元素的像素宽高，被包装组件
自身的根元素可以用 `width: 100%; height: 100%` 铺满该区域（不要反过来改写物料宿主元素的宽高，
见[创建物料目录](./material-catalog.md)的渲染盒不变式），并在宿主卸载时清理自身订阅和定时器。仓库外 React/Vue tarball 消费者
会验证类型增强、生产构建、事件、模型更新、断开重连和最终卸载。

## 宿主托管外部物料包

物料包不是普通的自定义物料集合，它有独立的注册契约。业务团队独立分发物料模块时，宿主负责
下载、完整性校验、信任审核和加载；Base Screen 不 fetch、不 dynamic import、不发现远程代码。
代码进入页面后，用 `createMaterialPackage()` 先完整校验再注册：

```ts
import { createBaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { createMaterialPackage } from '@base-screen/plugin-sdk';

const packageResult = createMaterialPackage({
  id: 'acme.kpi',
  materials: [
    { manifest: acmeKpiManifest, element: AcmeKpiElement },
    { manifest: acmeTrendManifest, element: AcmeTrendElement },
  ],
});
if (!packageResult.ok) throw new Error('外部物料包无效');

const defined = packageResult.value.define();
if (!defined.ok) throw new Error('外部物料注册冲突');

const hostedCatalog = createBaseScreenMaterialCatalog(defined.value);
```

契约要点：

- `id` 必须是合法 ASCII identifier（1..128 个 code unit，`[A-Za-z0-9._:-]`，首字符为字母或
  数字）。它只用于宿主侧诊断和配置，不进入 Screen Document、manifest 或运行时状态。
- `materials` 为数组且最多 512 项；每一项都会复用 `createMaterialDefinition` 完成 manifest
  解析、静态 manifest 一致性校验和数据集适配器校验，并拒绝包内重复 `type` / `tagName`。
- 创建期 fail closed 返回 `ScreenParseResult`，不抛异常、不访问浏览器全局；诊断代码为
  `PLUGIN_CORE_MANIFEST_*` / `PLUGIN_CORE_IDENTITY_*`，路径定位到 `['id']`、`['materials']`
  或 `['materials', index, ...]`。
- `define()` 注册前对全部 tagName 做冲突预检：任一冲突（同 tagName 绑定不同 constructor）
  整体失败且不产生部分注册副作用；同 tagName 同 constructor 幂等。成功后返回
  `BaseScreenMaterialCatalogEntry[]`，宿主用它一次性构建不可变 catalog。
- 文档只持久化物料 `type`。模块 URL、包名、版本和完整性信息是宿主分发配置，不得写入
  Screen Document 或 Material Manifest。
- 更换物料包版本 = 宿主重新加载新模块并重建 catalog；先 `unload()` 或销毁旧实例，再以新
  catalog 配置新实例。已初始化的实例不能原地替换 catalog。

不可信代码需要由宿主使用独立隔离方案；Shadow DOM、manifest 校验和 catalog 不是安全沙箱，
普通 Material ABI 不提供恶意代码隔离。

### 外部物料包的标准出口

可发布的外部物料包建议采用与官方物料一致的标准出口，便于宿主按同一路径接入：

```text
<package>                 根入口：manifest + constructor + define()，导入无副作用
<package>/auto-register   可选副作用入口：导入即注册该包声明的全部物料
```

```ts
// <package>/auto-register.ts —— 宿主选择“导入即注册”时使用
import { autoRegisterHostedMaterialPackage } from './index.js';
const registered = autoRegisterHostedMaterialPackage();
if (!registered.ok) {
  throw new Error(registered.diagnostics.map((item) => item.code).join(','));
}
```

宿主动态加载应使用代码中固定的 loader allowlist。宿主业务配置只能选择 allowlist key，不能把
Screen Document 中的字符串直接传给 `import()`：

```ts
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { createBaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import type { BaseScreenMaterialPackage } from '@base-screen/plugin-sdk';

type HostedMaterialModule = {
  readonly hostedMaterialPackage: BaseScreenMaterialPackage;
};

const approvedMaterialLoaders: Readonly<
  Record<string, () => Promise<HostedMaterialModule>>
> = {
  'acme.kpi': () => import('@acme/base-screen-kpi-materials'),
};

export async function loadApprovedMaterialCatalog(
  materialPackageId: string,
): Promise<BaseScreenMaterialCatalog> {
  const loader = approvedMaterialLoaders[materialPackageId];
  if (loader === undefined) throw new Error('物料包未获宿主批准');

  const loaded = await loader();
  const defined = loaded.hostedMaterialPackage.define();
  if (!defined.ok) {
    throw new Error(defined.diagnostics.map((item) => item.code).join(','));
  }
  return createBaseScreenMaterialCatalog(defined.value);
}
```

若宿主确实需要 URL 运行时加载，URL allowlist、CSP、完整性校验、鉴权、缓存和 bundler 配置都由宿主
实现；Base Screen 不提供通用网络加载器。
