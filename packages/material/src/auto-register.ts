import {
  defineBaseScreenContainerMaterial,
  defineBaseScreenEllipseMaterial,
  defineBaseScreenImageMaterial,
  defineBaseScreenRectangleMaterial,
  defineBaseScreenTextMaterial,
} from './index.js';

for (const define of [
  defineBaseScreenTextMaterial,
  defineBaseScreenRectangleMaterial,
  defineBaseScreenEllipseMaterial,
  defineBaseScreenImageMaterial,
  defineBaseScreenContainerMaterial,
]) {
  const definition = define();
  if (!definition.ok) {
    throw new Error('Base Screen official material registration failed.');
  }
}

export {
  defineBaseScreenContainerMaterial,
  defineBaseScreenEllipseMaterial,
  defineBaseScreenImageMaterial,
  defineBaseScreenRectangleMaterial,
  defineBaseScreenTextMaterial,
} from './index.js';
