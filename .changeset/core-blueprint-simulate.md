---
'@base-screen/core': minor
'@base-screen/engine': patch
'@base-screen/host-kit': minor
'base-screen': minor
---

蓝图级联模拟下沉 `core`（ADR-0115 D6）。

- `core` 新增 `simulateScreenBlueprint(document, event, options)` 与 `SCREEN_BLUEPRINT_SIMULATION_MAX_DEPTH`：从一个事件出发逐次分派，变量值改变后分派它的 `data-updated`，从画布开合与页面导航按查看器的顺序级联；请求类动作只登记。结果给出每次分派的轨迹、级联超限或求值失败，以及模拟结束时变了的变量、显隐变了的组件、引用变量且求值结果变了的数据源参数。纯函数，不取数、不调宿主动作。
- `engine`：蓝图工作台的「模拟」改用它，轨迹与原先一致。
- `host-kit`：筛选联动采纳前，按画像样本逐个取值造来源事件交给 `simulateScreenBlueprint`，看目标实例参数会不会变成不同的合法取值；页签（`tabChange.value`）与数值类（`valueClick.value`）负载也纳入模拟，不再记「未模拟」。
