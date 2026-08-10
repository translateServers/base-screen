import {
  defineBaseScreenChartMaterial,
  defineBaseScreenContainerMaterial,
  defineBaseScreenEChartsMaterial,
  defineBaseScreenEllipseMaterial,
  defineBaseScreenImageMaterial,
  defineBaseScreenRectangleMaterial,
  defineBaseScreenTableMaterial,
  defineBaseScreenTextMaterial,
} from './index.js';

for (const define of [
  defineBaseScreenTextMaterial,
  defineBaseScreenRectangleMaterial,
  defineBaseScreenEllipseMaterial,
  defineBaseScreenImageMaterial,
  defineBaseScreenContainerMaterial,
  defineBaseScreenChartMaterial,
  defineBaseScreenEChartsMaterial,
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
  defineBaseScreenEChartsMaterial,
  defineBaseScreenEllipseMaterial,
  defineBaseScreenImageMaterial,
  defineBaseScreenRectangleMaterial,
  defineBaseScreenTableMaterial,
  defineBaseScreenTextMaterial,
} from './index.js';
