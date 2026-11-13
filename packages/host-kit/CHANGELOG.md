# @base-screen/host-kit

## 0.1.0

### Minor Changes

- 061fa02: Reduce host integration protocol and lifecycle boilerplate while retaining the full element API.

  Engine exposes an isolated, lightweight authoritative project snapshot and change event. Designer mount controllers and framework components project the accepted initial snapshot and subsequent state through `onProjectState`, without a duplicate project read or host state machine. Failed normalized-document commits retain the previous project revision.

  Mount diagnostics carry the actual failure phase, instance availability and recovery mode through controllers, framework callbacks and fallback rendering. Existing one-argument diagnostics callbacks remain supported. Catalog refresh failures retain the active instance; configuration, project load and teardown failures have distinct contexts.

  Standard runtimes accept framework bridge catalog entries directly, preserving tabular data adapters through the existing registration and authorization plan. Full host examples use one standard runtime and tracked mounts, with online-material changes committed through `setCatalog`.

  Host-kit adds transport-neutral project and dataset adapters over existing host business callbacks. REST adapters reuse the same migration, contract validation, cancellation and error handling. Validated-result observers receive isolated request data, results and errors; observer mutations or failures cannot alter the port result. Host-owned business requests, authorization, persistence, asset management and alarm transports remain outside Engine. Query operations also receive their per-request execution context, preserving host tracing and project revision audit without shared state.

  Restore the ten stable `plugin.chart.*` chart-family identities already consumed by the production host, including their manifests, dataset adapters and ECharts options, so upgrading the host does not silently remove existing charts.

- 061fa02: 新增宿主接入辅助包 `@base-screen/host-kit`：`createHttpProjectAdapter` 与 `createRestDatasetPort`
  收编示例里反复手抄的项目适配器与数据集端口样板，内置契约硬规矩（剥 groups、signal 第二参、不下发
  componentId、错误码映射）与取消语义。仅依赖 contracts，可选使用，不改变既有公共契约。见 ADR-0096。

  各操作可通过 `mapping` 分别投影请求路径、方法、JSON body 与响应 envelope；投影结果仍经 canonical
  解析。项目自定义映射保留 opaque revision，数据集查询保留 boolean 参数和分页 cursor。请求或响应
  映射抛错会转为端口诊断，取消仍返回空诊断。底层 `HostKitHttp.request<T>()` 保持兼容。

### Patch Changes

- 061fa02: Prepare the core packages for public npm distribution with explicit public registry metadata and GitHub repository links. Peripheral plugins remain private and outside this release scope.

  Preserve the public host-token stylesheet during tree shaking. Mark Vue component factories as pure so Viewer-only consumers can remove Designer code.

  Add `createBaseScreenViewerRuntime` to the SDK Viewer entry with explicit material selection and no Designer registration. Full and Viewer runtimes share plugin activation, catalog transactions, tracked mounts and disposal. React and Vue Viewer components accept either runtime while Designer components retain their full runtime requirement.

  Verify original packed archives, converted internal semver ranges and isolated consumer imports without rewriting published manifests. Add Viewer-only production-bundle and browser lifecycle coverage and fix the documented result handling.
