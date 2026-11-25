---
'@base-screen/engine': minor
'@base-screen/sdk': minor
'base-screen': minor
---

移除场景切换（ADR-0092 §4，2026-11-23）。

**破坏性变更**

- 设计器元素删除 `setSceneCatalog()`、`setSceneHandler()`、`setActiveScene()`、`activeSceneId`、`sceneAvailable`。
- 删除 `base-screen-scene-change` 事件与 `BASE_SCREEN_SCENE_CHANGE_EVENT`、`BaseScreenSceneChangeDetail`、
  `DesignerSceneDescriptor`、`DesignerSceneHandler`、`DesignerScenePlan`、`DesignerScenePrepareResult`、
  `DesignerScenePreview`、`DesignerSceneRequest`、`prepareDesignerScenePreview`。
- 左栏顶部场景区与画布「场景预览 · 未写入」条随之移除；度量事件不再有 `scene_preview` / `scene_apply`。

同屏内容切换请改用弹框画板（ADR-0108）或蓝图显隐与变量。
