import { copyFileSync, mkdirSync } from 'node:fs';

// 当前脚本位于 <root>/tooling/build/，需要向上两级到达仓库根
const source = new URL('../../packages/contracts/src/', import.meta.url);
const target = new URL('../../packages/contracts/dist/', import.meta.url);

mkdirSync(target, { recursive: true });
copyFileSync(
  new URL('screen-document.schema.json', source),
  new URL('screen-document.schema.json', target),
);
