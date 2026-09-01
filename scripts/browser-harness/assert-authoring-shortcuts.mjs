import { assertAuthoringMarquee } from './assert-authoring-marquee.mjs';
import { assertAuthoringMaterialVisuals } from './assert-authoring-material-visuals.mjs';
import { assertAuthoringPaletteInteractions } from './assert-authoring-palette-interactions.mjs';
import { assertAuthoringPaletteLayout } from './assert-authoring-palette-layout.mjs';
import { assertAuthoringSelection } from './assert-authoring-selection.mjs';
import { assertAuthoringVariables } from './assert-authoring-variables.mjs';
import { assertHostVariableAuthoring } from './assert-host-variable-authoring.mjs';

export async function assertAuthoringShortcutsAndIsolation(page, designer) {
  await assertAuthoringSelection(page, designer);
  await assertAuthoringMarquee(page, designer);
  await assertAuthoringVariables(page, designer);
  await assertHostVariableAuthoring(page, designer);
  await assertAuthoringMaterialVisuals(page, designer);
  await assertAuthoringPaletteLayout(page, designer);
  await assertAuthoringPaletteInteractions(page, designer);
}
