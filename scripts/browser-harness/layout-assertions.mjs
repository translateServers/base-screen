function rectWithin(actual, expected, tolerance = 2) {
  if (actual === undefined || expected === undefined) return actual === expected;
  return ['x', 'y', 'width', 'height'].every(
    (key) => Math.abs(actual[key] - expected[key]) <= tolerance,
  );
}

function assertPositiveNonOverlappingRects(rects, axis, viewport) {
  if (rects.some((rect) => rect === undefined || rect.width <= 0 || rect.height <= 0)) {
    throw new Error(
      `BROWSER_HARNESS_${axis}_REGION_SIZE_FAILED: ${viewport.width}x${viewport.height} ${JSON.stringify(rects)}`,
    );
  }
  for (let index = 0; index < rects.length; index++) {
    for (let other = index + 1; other < rects.length; other++) {
      if (rectanglesOverlap(rects[index], rects[other])) {
        throw new Error(
          `BROWSER_HARNESS_${axis}_REGION_OVERLAP_FAILED: ${viewport.width}x${viewport.height} ${JSON.stringify({ first: rects[index], second: rects[other] })}`,
        );
      }
    }
  }
}

function rectanglesOverlap(first, second) {
  return (
    first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top
  );
}

async function assertOverlayContained(designer, selector) {
  const contained = await designer.evaluate((element, overlaySelector) => {
    const overlay = element.shadowRoot?.querySelector(overlaySelector);
    if (overlay === null || overlay === undefined || overlay.getAttribute('hidden') !== null)
      return false;
    const host = element.getBoundingClientRect();
    const bounds = overlay.getBoundingClientRect();
    return (
      bounds.width > 0 &&
      bounds.height > 0 &&
      bounds.left >= host.left &&
      bounds.top >= host.top &&
      bounds.right <= host.right &&
      bounds.bottom <= host.bottom
    );
  }, selector);
  if (!contained) throw new Error('BROWSER_HARNESS_OVERLAY_CONTAINMENT_FAILED');
}

export { assertOverlayContained, assertPositiveNonOverlappingRects, rectWithin };
