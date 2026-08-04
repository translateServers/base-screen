import baseCss from './designer-base.css?inline';
import controlsCss from './designer-controls.css?inline';
import tokensCss from './designer-tokens.css?inline';
import workbenchCss from './designer-workbench.css?inline';

const DESIGNER_CSS = [tokensCss, baseCss, controlsCss, workbenchCss].join('\n');

export function createDesignerStyle(ownerDocument: Document): HTMLStyleElement {
  const style = ownerDocument.createElement('style');
  style.textContent = DESIGNER_CSS;
  return style;
}
