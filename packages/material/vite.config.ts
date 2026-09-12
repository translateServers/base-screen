import { fileURLToPath } from 'node:url';
import { createViteLibraryConfig } from '../../scripts/create-vite-library-config.ts';

const packageRoot = fileURLToPath(new URL('.', import.meta.url));

// 按物料拆分入口（P0-7）：宿主只需部分官方物料时可经 `@base-screen/material/text`
// 等子路径引入，未引用的物料经 tree-shaking 剔除；index 仍为全量 facade。
export default createViteLibraryConfig(packageRoot, {
  'auto-register': `${packageRoot}src/auto-register.ts`,
  chart: `${packageRoot}src/chart.ts`,
  container: `${packageRoot}src/container.ts`,
  image: `${packageRoot}src/image.ts`,
  index: `${packageRoot}src/index.ts`,
  shapes: `${packageRoot}src/shapes.ts`,
  table: `${packageRoot}src/table.ts`,
  text: `${packageRoot}src/text.ts`,
});
