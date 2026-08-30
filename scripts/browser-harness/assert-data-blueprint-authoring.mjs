import { assertBlueprintWorkbench } from './assert-blueprint-workbench.mjs';
import { assertComponentTextAuthoring } from './assert-component-text-authoring.mjs';
import { assertDatasetAuthoring } from './assert-dataset-authoring.mjs';
import { assertDatasetSurface } from './assert-dataset-surface.mjs';
import { assertEchartsAuthoring } from './assert-echarts-authoring.mjs';

export async function assertDataAndBlueprintAuthoring(designer, page) {
  await assertDatasetSurface(designer, page);
  const hostEventCount = await assertDatasetAuthoring(designer, page);
  await assertBlueprintWorkbench(designer, page);
  await assertComponentTextAuthoring(designer, page, hostEventCount);
  await assertEchartsAuthoring(designer, page);
}
