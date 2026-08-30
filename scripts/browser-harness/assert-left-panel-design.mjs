import { assertBlueprintHostLeftPanelGroups } from '../verify-browser-blueprint-host-left-panel-groups.mjs';
import { assertHostLeftPanelGroups } from './assert-host-left-panel-groups.mjs';
import { assertLeftPanelLayers } from './assert-left-panel-layers.mjs';
import { assertLeftPanelMaterials } from './assert-left-panel-materials.mjs';
import { screenshotDirectory } from './constants.mjs';

export async function assertLeftPanelDesign(designer, page, viewport) {
  await assertLeftPanelMaterials(designer, page);
  await assertLeftPanelLayers(page, viewport);
  await assertHostLeftPanelGroups(designer);
  await assertBlueprintHostLeftPanelGroups(designer);
  await designer.locator('[data-left-panel]').screenshot({
    path: `${screenshotDirectory}/left-panel-${viewport.width}x${viewport.height}.png`,
  });
}
