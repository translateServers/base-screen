import type { ScreenCanvas, ScreenCanvasBackground } from '@base-screen/contracts';

export function applyCanvasBackground(root: HTMLElement, canvas: ScreenCanvas): void {
  const background = canvas.background;
  root.style.backgroundColor =
    background?.type === 'solid' ? background.color : canvas.backgroundColor;

  const imageLayers: string[] = [];
  const sizes: string[] = [];
  if (canvas.backgroundImage !== undefined) {
    imageLayers.push(`url("${escapeCssString(canvas.backgroundImage)}")`);
    sizes.push(canvas.backgroundImageFit === 'contain' ? 'contain' : 'cover');
  }
  const gradient = background === undefined ? undefined : canvasGradient(background);
  if (gradient !== undefined) {
    imageLayers.push(gradient);
    sizes.push('100% 100%');
  }

  if (imageLayers.length === 0) {
    root.style.backgroundImage = '';
    root.style.backgroundSize = '';
    root.style.backgroundPosition = '';
    root.style.backgroundRepeat = '';
    return;
  }
  root.style.backgroundImage = imageLayers.join(', ');
  root.style.backgroundSize = sizes.join(', ');
  root.style.backgroundPosition = imageLayers.map(() => 'center').join(', ');
  root.style.backgroundRepeat = imageLayers.map(() => 'no-repeat').join(', ');
}

function canvasGradient(background: ScreenCanvasBackground): string | undefined {
  if (background.type === 'solid') return undefined;
  const stops = background.stops.map((stop) => `${stop.color} ${stop.position}%`).join(', ');
  if (background.type === 'linear-gradient') {
    return `linear-gradient(${background.angle}deg, ${stops})`;
  }
  return `radial-gradient(circle at ${background.position.x}% ${background.position.y}%, ${stops})`;
}

/** CSS 字符串转义（用于 url("...") 值；校验已拒绝空白/控制字符/反斜杠，此处防御性转义 `\` 与 `"`）。 */
function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
