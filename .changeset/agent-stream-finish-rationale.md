---
'@base-screen/engine': minor
'base-screen': minor
---

`finishChangeProposal(id, { rationale })`：结束流式生成时可换上最终理由（ADR-0112 §2.5）。降级告警这类信息只有整份结果到齐才知道，骨架挂出时的理由只能写「生成中」；只换理由、不改命令，几何与内容都不动。
