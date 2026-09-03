export async function assertVariableListThemeQuality(page) {
  const quality = await page.evaluate(async () => {
    const designer = window.baseScreenHarness.designer;
    const panel = designer.shadowRoot.querySelector('[data-variables]');
    const add = panel.querySelector('[data-variable-action="add"]');
    const sample = () => {
      const addStyle = getComputedStyle(add);
      const valueStyle = getComputedStyle(panel.querySelector('.variable-value-button'));
      const row = panel.querySelector('[data-variable-id="region"]');
      const rowStyle = getComputedStyle(row);
      const name = row.querySelector('.variable-name');
      const nameStyle = getComputedStyle(name);
      const context = row.querySelector('.variable-row-context-value');
      const contextStyle = getComputedStyle(context);
      const usage = row.querySelector('.variable-reference-count');
      const usageStyle = getComputedStyle(usage);
      const action = panel.querySelector('[data-variable-id="count"] .variable-icon-action');
      const actionStyle = getComputedStyle(action);
      const badges = [...panel.querySelectorAll('.variable-badge')].map((badge) => {
        const style = getComputedStyle(badge);
        return {
          background: style.backgroundColor,
          color: style.color,
          surface: getComputedStyle(badge.closest('[data-variable-row]')).backgroundColor,
        };
      });
      return {
        addColor: addStyle.color,
        addBackground: addStyle.backgroundColor,
        valueColor: valueStyle.color,
        valueBackground: valueStyle.backgroundColor,
        rowBackground: rowStyle.backgroundColor,
        rowHeight: row.getBoundingClientRect().height,
        nameColor: nameStyle.color,
        nameWidth: name.getBoundingClientRect().width,
        contextColor: contextStyle.color,
        contextTop: context.getBoundingClientRect().top,
        usageColor: usageStyle.color,
        usageBackground: usageStyle.backgroundColor,
        actionColor: actionStyle.color,
        actionBackground: actionStyle.backgroundColor,
        badges,
      };
    };
    const channels = (color) => {
      if (Array.isArray(color)) return color;
      const values = color.match(/[\d.]+/g)?.map(Number) ?? [];
      return color.startsWith('color(srgb')
        ? values.slice(0, 3)
        : values.slice(0, 3).map((value) => value / 255);
    };
    const alpha = (color) => {
      const values = color.match(/[\d.]+/g)?.map(Number) ?? [];
      return color.startsWith('color(srgb') || color.startsWith('rgba') ? (values[3] ?? 1) : 1;
    };
    const composite = (foreground, background) => {
      const foregroundChannels = channels(foreground);
      const backgroundChannels = channels(background);
      const foregroundAlpha = alpha(foreground);
      return foregroundChannels.map(
        (value, index) =>
          value * foregroundAlpha + backgroundChannels[index] * (1 - foregroundAlpha),
      );
    };
    const luminance = (color) =>
      channels(color)
        .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const contrast = (foreground, background) => {
      const values = [luminance(foreground), luminance(background)].sort(
        (left, right) => right - left,
      );
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    designer.removeAttribute('theme');
    const dark = sample();
    designer.setAttribute('theme', 'light');
    const immediate = sample();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const light = sample();
    designer.removeAttribute('theme');
    const summarizeContrast = (theme) => ({
      action: contrast(theme.actionColor, theme.actionBackground),
      add: contrast(theme.addColor, theme.addBackground),
      badge: Math.min(
        ...theme.badges.map((badge) =>
          contrast(badge.color, composite(badge.background, badge.surface)),
        ),
      ),
      context: contrast(theme.contextColor, theme.rowBackground),
      name: contrast(theme.nameColor, theme.rowBackground),
      usage: contrast(theme.usageColor, theme.usageBackground),
    });
    return {
      atomic: JSON.stringify(immediate) === JSON.stringify(light),
      geometryStable:
        dark.rowHeight === light.rowHeight &&
        dark.nameWidth === light.nameWidth &&
        dark.contextTop === light.contextTop,
      dark: summarizeContrast(dark),
      light: summarizeContrast(light),
    };
  });
  const contrastFailed = [quality.dark, quality.light].some(
    (theme) =>
      theme.action < 3 ||
      theme.add < 4.5 ||
      theme.badge < 4.5 ||
      theme.context < 4.5 ||
      theme.name < 4.5 ||
      theme.usage < 4.5,
  );
  if (!quality.atomic || !quality.geometryStable || contrastFailed) {
    throw new Error(`BROWSER_HARNESS_VARIABLES_THEME_QUALITY_FAILED:${JSON.stringify(quality)}`);
  }
  await page.waitForTimeout(200);
}
