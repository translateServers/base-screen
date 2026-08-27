export const COLOR_CONTROL_TEMPLATE = String.raw`
  <style data-control-styles></style>
  <button class="color-trigger" type="button" data-action="toggle" aria-haspopup="dialog">
    <span class="checkerboard color-trigger__swatch" data-trigger-swatch aria-hidden="true"></span>
    <span class="color-trigger__value" data-trigger-value></span>
    <svg class="color-trigger__icon" viewBox="0 0 20 20" aria-hidden="true">
      <defs><linearGradient id="wheel" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#ff5470"/><stop offset=".35" stop-color="#ffd166"/>
        <stop offset=".68" stop-color="#36d399"/><stop offset="1" stop-color="#5595ff"/>
      </linearGradient></defs>
      <circle cx="10" cy="10" r="7" fill="none" stroke="url(#wheel)" stroke-width="3"/>
      <circle cx="10" cy="10" r="2.5" fill="#202832"/>
    </svg>
  </button>

  <section class="color-popover" data-popover role="dialog" aria-label="选择颜色">
    <div class="color-toolbar">
      <div class="mode-tabs" data-mode-tabs role="group" aria-label="颜色类型">
        <button type="button" data-mode="solid" aria-label="纯色" title="纯色">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor" stroke="none"/>
          </svg>
        </button>
        <button type="button" data-mode="linear-gradient" aria-label="线性渐变" title="线性渐变">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="3"/><path d="M5 18 18 5M10 20 21 9"/>
          </svg>
        </button>
        <button type="button" data-mode="radial-gradient" aria-label="径向渐变" title="径向渐变">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>
            <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
          </svg>
        </button>
      </div>
      <button class="icon-button" type="button" data-action="close" aria-label="关闭颜色选择器">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8"/></svg>
      </button>
    </div>

    <section class="gradient-editor" data-gradient-editor aria-label="渐变色标与参数">
      <div class="gradient-rail checkerboard" data-gradient-rail aria-label="渐变色标轨道"></div>
      <div class="stop-tools">
        <label>
          <span>色标位置</span>
          <span class="number-suffix"><input type="number" min="0" max="100" data-stop-position /><span aria-hidden="true">%</span></span>
        </label>
        <div class="stop-actions">
          <button type="button" data-action="add-stop">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>
            添加
          </button>
          <button type="button" data-action="remove-stop">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 6h10M8 6V4h4v2m2 0-.6 10H6.6L6 6m3 3v4m2-4v4"/></svg>
            删除
          </button>
        </div>
      </div>
      <div class="linear-settings" data-linear-settings>
        <label>
          <span>渐变角度</span>
          <span class="number-suffix"><input type="number" min="0" max="360" data-linear-angle /><span aria-hidden="true">°</span></span>
        </label>
      </div>
      <div class="radial-settings" data-radial-settings>
        <fieldset>
          <legend>渐变形状</legend>
          <div>
            <button type="button" data-radial-shape="circle">圆形</button>
            <button type="button" data-radial-shape="ellipse">椭圆</button>
          </div>
        </fieldset>
        <label>
          <span>中心 X</span>
          <span class="number-suffix"><input type="number" min="0" max="100" data-radial-center="x" /><span aria-hidden="true">%</span></span>
        </label>
        <label>
          <span>中心 Y</span>
          <span class="number-suffix"><input type="number" min="0" max="100" data-radial-center="y" /><span aria-hidden="true">%</span></span>
        </label>
      </div>
    </section>

    <button class="saturation-plane" type="button" data-saturation aria-label="饱和度和明度">
      <span class="plane-thumb" aria-hidden="true"></span>
    </button>

    <div class="slider-row">
      <div class="color-sliders">
        <label>
          <span class="sr-only">色相</span>
          <input class="hue-slider" type="range" min="0" max="360" step="1" data-hue />
        </label>
        <label class="checkerboard alpha-track">
          <span class="sr-only">透明度</span>
          <input class="alpha-slider" type="range" min="0" max="100" step="1" data-alpha />
        </label>
      </div>
      <span class="checkerboard current-color" data-current-color aria-hidden="true"></span>
    </div>

    <div class="channel-grid">
      <label class="channel-field channel-field--hex">
        <span>Hex</span>
        <input type="text" inputmode="text" maxlength="9" spellcheck="false" data-hex />
      </label>
      <label class="channel-field"><span>R</span><input type="number" min="0" max="255" data-channel="r" /></label>
      <label class="channel-field"><span>G</span><input type="number" min="0" max="255" data-channel="g" /></label>
      <label class="channel-field"><span>B</span><input type="number" min="0" max="255" data-channel="b" /></label>
      <label class="channel-field"><span>A</span><input type="number" min="0" max="100" data-channel="a" /></label>
    </div>
    <p class="field-message" data-field-message aria-live="polite"></p>

    <section class="quick-colors" aria-labelledby="quick-colors-title">
      <span id="quick-colors-title">常用颜色</span>
      <div data-quick-colors></div>
    </section>
  </section>
`;
