---
'@base-screen/engine': patch
'@base-screen/renderer': patch
'base-screen': patch
---

切换画布不再卡顿：画板外组件的「隐藏且锁定」副本与参照底图的组件副本按原组件缓存复用；渲染器的 model 重赋值守卫按宿主输入的组件判定（解析克隆不再让新组件在下一次渲染被重写一遍），只改显隐的组件只切 `display`、不重写 model（上次写入时隐藏的组件重新显示仍完整重写）。示例页每次切换由约 60ms 降到约 27ms，未变组件零重写。
