// ADR-0040 物料宿主封面验证：harness 的 cover 探针实例（仅含托管包目录，hosted-metric 声明
// 根相对 cover '/cover.svg'）在卡片缩略图区渲染真实封面；加载后图片与缩略图容器都置
// data-material-cover-loaded（opacity 1、object-fit cover），占位图标保留为回退层，
// 缩略图几何与无封面卡片完全一致（无抖动）。断言后移除探针实例，不影响主流程与截图。
async function assertCoverThumbnail(page) {
  await page.evaluate(() => window.baseScreenHarness.createCoverProbeDemo());
  const probe = page.locator('base-screen-designer[data-cover-probe]');
  await probe.waitFor({ state: 'attached', timeout: 5000 });
  await page.waitForFunction(
    () => {
      const root = document.querySelector('base-screen-designer[data-cover-probe]')?.shadowRoot;
      const grid = root?.querySelector('[data-material-grid]');
      return grid !== null && grid !== undefined && grid.children.length >= 2;
    },
    undefined,
    { timeout: 8000 },
  );
  const card = probe.locator('[data-material-card="harness.hosted-metric"]');
  await card.scrollIntoViewIfNeeded();
  await probe
    .locator(
      '[data-material-card="harness.hosted-metric"] .material-cover[data-material-cover-loaded]',
    )
    .waitFor({ state: 'attached', timeout: 8000 });
  // opacity 过渡进行中时计算样式仍为 0，等过渡结束（opacity 1）再采样。
  await page.waitForFunction(
    () => {
      const root = document.querySelector('base-screen-designer[data-cover-probe]')?.shadowRoot;
      const image = root?.querySelector(
        '[data-material-card="harness.hosted-metric"] .material-cover',
      );
      return image !== null && image !== undefined && getComputedStyle(image).opacity === '1';
    },
    undefined,
    { timeout: 8000 },
  );
  const observed = await probe.evaluate((element) => {
    const root = element.shadowRoot;
    const card = root.querySelector('[data-material-card="harness.hosted-metric"]');
    const thumb = card?.querySelector('.material-thumb');
    const image = thumb?.querySelector('.material-cover');
    const plainThumb = root
      .querySelector('[data-material-card="harness.hosted-badge"]')
      ?.querySelector('.material-thumb');
    const coverStyle = image === null || image === undefined ? undefined : getComputedStyle(image);
    return {
      src: image?.getAttribute('src'),
      alt: image?.getAttribute('alt'),
      draggable: image?.getAttribute('draggable'),
      loading: image?.getAttribute('loading'),
      decoding: image?.getAttribute('decoding'),
      thumbAriaHidden: thumb?.getAttribute('aria-hidden'),
      loadedOnImage: image?.hasAttribute('data-material-cover-loaded') ?? false,
      loadedOnThumb: thumb?.hasAttribute('data-material-cover-loaded') ?? false,
      opacity: coverStyle?.opacity,
      objectFit: coverStyle?.objectFit,
      placeholderSvg: thumb?.querySelector('svg') !== null,
      // ADR-0042：物料卡片网格项启用 content-visibility（屏外跳过渲染）。
      cardContentVisibility:
        card === null || card === undefined ? null : getComputedStyle(card).contentVisibility,
      thumbRect:
        thumb === null || thumb === undefined ? null : thumb.getBoundingClientRect().toJSON(),
      plainThumbRect:
        plainThumb === null || plainThumb === undefined
          ? null
          : plainThumb.getBoundingClientRect().toJSON(),
    };
  });
  // ADR-0041 自适应封面：200x24 窄条封面应完整 contain 显示（不放大、不裁切），
  // 缩略图容器带 data-material-cover-fit="contain" 标记，计算样式 object-fit: contain；
  // 缩略图几何仍与无封面卡片一致（无抖动）。
  const tinyCard = probe.locator('[data-material-card="harness.hosted-tiny"]');
  await tinyCard.scrollIntoViewIfNeeded();
  await probe
    .locator(
      '[data-material-card="harness.hosted-tiny"] .material-cover[data-material-cover-loaded]',
    )
    .waitFor({ state: 'attached', timeout: 8000 });
  await page.waitForFunction(
    () => {
      const root = document.querySelector('base-screen-designer[data-cover-probe]')?.shadowRoot;
      const thumb = root?.querySelector(
        '[data-material-card="harness.hosted-tiny"] .material-thumb',
      );
      const image = thumb?.querySelector('.material-cover');
      return (
        image !== null &&
        image !== undefined &&
        getComputedStyle(image).opacity === '1' &&
        thumb?.hasAttribute('data-material-cover-fit')
      );
    },
    undefined,
    { timeout: 8000 },
  );
  const tinyObserved = await probe.evaluate((element) => {
    const root = element.shadowRoot;
    const card = root.querySelector('[data-material-card="harness.hosted-tiny"]');
    const thumb = card?.querySelector('.material-thumb');
    const image = thumb?.querySelector('.material-cover');
    const plainThumb = root
      .querySelector('[data-material-card="harness.hosted-badge"]')
      ?.querySelector('.material-thumb');
    const coverStyle = image === null || image === undefined ? undefined : getComputedStyle(image);
    return {
      src: image?.getAttribute('src'),
      loadedOnImage: image?.hasAttribute('data-material-cover-loaded') ?? false,
      fitOnThumb: thumb?.getAttribute('data-material-cover-fit'),
      objectFit: coverStyle?.objectFit,
      thumbRect:
        thumb === null || thumb === undefined ? null : thumb.getBoundingClientRect().toJSON(),
      plainThumbRect:
        plainThumb === null || plainThumb === undefined
          ? null
          : plainThumb.getBoundingClientRect().toJSON(),
    };
  });
  await page.evaluate(() => {
    document.querySelector('base-screen-designer[data-cover-probe]')?.remove();
  });
  const geometryMatches =
    observed.thumbRect !== null &&
    observed.plainThumbRect !== null &&
    Math.abs(observed.thumbRect.width - observed.plainThumbRect.width) < 1 &&
    Math.abs(observed.thumbRect.height - observed.plainThumbRect.height) < 1;
  const tinyGeometryMatches =
    tinyObserved.thumbRect !== null &&
    tinyObserved.plainThumbRect !== null &&
    Math.abs(tinyObserved.thumbRect.width - tinyObserved.plainThumbRect.width) < 1 &&
    Math.abs(tinyObserved.thumbRect.height - tinyObserved.plainThumbRect.height) < 1;
  if (
    observed.src !== '/cover.svg' ||
    observed.alt !== '' ||
    observed.draggable !== 'false' ||
    observed.loading !== 'lazy' ||
    observed.decoding !== 'async' ||
    observed.thumbAriaHidden !== 'true' ||
    !observed.loadedOnImage ||
    !observed.loadedOnThumb ||
    observed.opacity !== '1' ||
    observed.objectFit !== 'cover' ||
    observed.cardContentVisibility !== 'auto' ||
    !observed.placeholderSvg ||
    !geometryMatches
  ) {
    throw new Error(`BROWSER_HARNESS_COVER_THUMBNAIL_FAILED:${JSON.stringify(observed)}`);
  }
  if (
    tinyObserved.src !== '/tiny-cover.svg' ||
    !tinyObserved.loadedOnImage ||
    tinyObserved.fitOnThumb !== 'contain' ||
    tinyObserved.objectFit !== 'contain' ||
    !tinyGeometryMatches
  ) {
    throw new Error(`BROWSER_HARNESS_COVER_ADAPTIVE_FAILED:${JSON.stringify(tinyObserved)}`);
  }
}

export { assertCoverThumbnail };
