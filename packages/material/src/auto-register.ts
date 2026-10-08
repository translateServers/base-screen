import {
  defineBaseScreenChartMaterial,
  defineBaseScreenContainerMaterial,
  defineBaseScreenEllipseMaterial,
  defineBaseScreenImageMaterial,
  defineBaseScreenRectangleMaterial,
  defineBaseScreenRuleMaterial,
  defineBaseScreenTableMaterial,
  defineBaseScreenTextMaterial,
} from './index.js';

for (const define of [
  defineBaseScreenTextMaterial,
  defineBaseScreenRectangleMaterial,
  defineBaseScreenEllipseMaterial,
  defineBaseScreenRuleMaterial,
  defineBaseScreenImageMaterial,
  defineBaseScreenContainerMaterial,
  defineBaseScreenChartMaterial,
  defineBaseScreenTableMaterial,
]) {
  const definition = define();
  if (!definition.ok) {
    throw new Error('Base Screen official material registration failed.');
  }
}

export {
  defineBaseScreenChartMaterial,
  defineBaseScreenContainerMaterial,
  defineBaseScreenEllipseMaterial,
  defineBaseScreenImageMaterial,
  defineBaseScreenRectangleMaterial,
  defineBaseScreenRuleMaterial,
  defineBaseScreenTableMaterial,
  defineBaseScreenTextMaterial,
} from './index.js';
