import type { ScreenJsonObject, ScreenSize } from 'base-screen/contracts';
import type {
  BaseScreenAuthoringFinding,
  BaseScreenMaterialSpec,
  BaseScreenMaterialSpecData,
  BaseScreenMaterialSpecField,
  BaseScreenMaterialSpecNumberFormat,
  BaseScreenMaterialSpecRole,
} from 'base-screen/plugins';
import { createAppShell } from '../components/app-shell';
import { showToast } from '../components/toast';
import { el } from '../lib/dom';
import { goToAtomicComponent, goToComponents, goToEdit } from '../lib/navigation';
import type { Route, ViewModule } from '../router';
import { type CodeEditorHandle, createCodeEditor } from '../screen/code-editor';
import {
  ATOMIC_COMPONENT_TEMPLATES,
  type AtomicComponentItem,
  type AtomicComponentSource,
  auditAtomicComponent,
  COMPONENT_DATA_OPTIONS,
  COMPONENT_FIELD_KIND_OPTIONS,
  COMPONENT_SECTION_OPTIONS,
  createAtomicComponentType,
  deleteAtomicComponent,
  discardAtomicDraft,
  findingTarget,
  isTemplateComponentSource,
  loadComponentLibrary,
  publishAtomicComponent,
  RENDER_CONTEXT_COMPLETIONS,
  saveAtomicDraft,
  setAtomicVisibility,
} from '../screen/component-library';
import {
  type CompiledPreview,
  compilePreview,
  type PreviewDataMode,
  renderPreview,
} from '../screen/component-preview';
import { readTemplateText } from '../screen/component-workshop';
import type { ComponentDraftShape, OnlineMaterialPackageShape } from '../types';

/**
 * 原子组件编辑器（ADR-0106 §2.3 / brief P2）：全页三栏 + 底部代码面板。
 *
 * - 左栏「结构」：数据形状、读数格式、可调项列表（按检查器分组、可拖动排序）；
 * - 中栏「预览」：可拖拽改尺寸的实时预览，四态 / 背景 / 缩放切换，下方是 CodeMirror 代码面板；
 * - 右栏「检查器」：选中可调项时编辑它的定义；否则按编译出的描述符呈现检查器，并直接改默认值。
 *
 * 改动自动存为草稿（ADR-0106 D3），不影响已发布版本；「发布」先体检，再写在线物料包并热刷新。
 * L2 模板物料（ADR-0116，规格带 `template`）没有渲染代码：底部面板换成模板 JSON，体检的 TPL 结论定位到这里。
 * 规格词汇（section / kind / visibleWhen …）不出现在界面上，作者用语见 `component-library.ts`。
 */
type Field = BaseScreenMaterialSpecField;

/** 编译出的检查器字段里本页用到的部分（结构类型：只读，不依赖描述符的完整形状）。 */
interface DescriptorFieldView {
  readonly id: string;
  readonly label: string;
  readonly path: readonly (string | number)[];
  readonly control?: string;
  readonly when?: readonly {
    readonly path: readonly (string | number)[];
    readonly operator: string;
    readonly value?: unknown;
  }[];
}
type Backdrop = 'dark' | 'light' | 'screen';
type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'failed' | 'conflict';

const PROPS_SECTIONS: ReadonlySet<string> = new Set(['format', 'structure', 'motion']);
const AUTOSAVE_DELAY = 1200;
const REFRESH_DELAY = 300;
const CODE_HEIGHT_KEY = 'base-screen.host.component-editor.code-height';
const KEY_PATTERN = /^[a-z][A-Za-z0-9]{0,39}$/;

export const componentAtomicEditView: ViewModule = {
  mount(container, route: Route): () => void {
    const main = el('div', { class: 'shell__main component-editor-host' });
    container.append(createAppShell(main, 'components').root);
    const controller = new AbortController();
    const routeType = route.name === 'component-atomic' ? route.type : undefined;
    const template =
      ATOMIC_COMPONENT_TEMPLATES.find((item) => item.id === readHashParam('template')) ??
      ATOMIC_COMPONENT_TEMPLATES[0]!;

    // ———————— 状态 ————————
    let type = '';
    let spec: BaseScreenMaterialSpec = template.build('host.online.pending').spec;
    let renderBody = '';
    /** L2 模板的 JSON 文本；undefined 表示这是代码物料。组件的形态在打开时定下，页面内不切换。 */
    let templateText: string | undefined;
    let pkg: OnlineMaterialPackageShape | undefined;
    let draft: ComponentDraftShape | undefined;
    let published: AtomicComponentSource | undefined;
    let references: AtomicComponentItem['references'] = [];
    let saveState: SaveState = 'clean';
    let savedAt: Date | undefined;
    let findings: readonly BaseScreenAuthoringFinding[] = [];
    let selected: number | undefined;
    let previewMode: PreviewDataMode = 'ready';
    let backdrop: Backdrop = 'screen';
    let zoom: 'fit' | 'actual' = 'fit';
    let previewSize: ScreenSize = { ...spec.defaultSize };
    let compiled: CompiledPreview | undefined;
    let compileError: string | undefined;
    let busy = false;
    let disposed = false;
    let saveTimer: number | undefined;
    let refreshTimer: number | undefined;
    let refreshToken = 0;
    let menuOpen = false;
    let problemsOpen = false;
    let code: CodeEditorHandle | undefined;

    // ———————— 骨架 ————————
    const back = el('button', {
      class: 'button component-editor__back',
      text: '← 组件库',
      attrs: { type: 'button' },
      on: { click: () => leave(goToComponents) },
    });
    const nameInput = el('input', {
      class: 'component-editor__name',
      attrs: { type: 'text', 'aria-label': '组件名称', maxlength: '64', 'data-component-name': '' },
    });
    nameInput.addEventListener('input', () => {
      spec = { ...spec, name: nameInput.value };
      changed({ left: false, right: selected === undefined });
    });
    const saveBadge = el('span', {
      class: 'component-editor__save',
      attrs: { 'aria-live': 'polite', 'data-component-save-state': '' },
    });
    const problemsButton = el('button', {
      class: 'button component-editor__problems-toggle',
      attrs: { type: 'button', 'aria-expanded': 'false', 'data-component-problems': '' },
      on: {
        click: () => {
          problemsOpen = !problemsOpen;
          renderProblems();
        },
      },
    });
    const menuButton = el('button', {
      class: 'button',
      text: '更多',
      attrs: { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
      on: {
        click: () => {
          menuOpen = !menuOpen;
          renderMenu();
        },
      },
    });
    const menu = el('div', { class: 'component-editor__menu', attrs: { role: 'menu' } });
    const publishButton = el('button', {
      class: 'button button--primary',
      text: '发布',
      attrs: { type: 'button', 'data-component-publish': '' },
      on: { click: () => void confirmPublish() },
    });
    const topbar = el('header', { class: 'component-editor__topbar' }, [
      back,
      nameInput,
      el('span', { class: 'ds-badge component-badge component-badge--atomic', text: '原子' }),
      saveBadge,
      el('span', { class: 'component-library__spacer' }),
      problemsButton,
      el('div', { class: 'component-editor__menu-anchor' }, [menuButton, menu]),
      publishButton,
    ]);

    const left = el('aside', { class: 'component-editor__left', attrs: { 'aria-label': '结构' } });
    const right = el('aside', {
      class: 'component-editor__right',
      attrs: { 'aria-label': '检查器' },
    });

    const stageFrame = el('div', { class: 'component-stage__frame' });
    const stageBox = el('div', {
      class: 'component-stage__box',
      attrs: { 'data-component-preview': '' },
    });
    const stageMount = el('div', { class: 'component-stage__mount' });
    const sizeHandle = el('span', {
      class: 'component-stage__handle',
      attrs: { 'aria-hidden': 'true', title: '拖动改变预览尺寸（Shift 保持比例）' },
    });
    const sizeLabel = el('span', { class: 'component-stage__size' });
    const previewNote = el('p', { class: 'component-stage__note', attrs: { role: 'status' } });
    stageBox.append(stageMount, sizeHandle);
    stageFrame.append(stageBox, previewNote);
    const stageToolbar = el('div', { class: 'component-stage__toolbar' });
    const stage = el('section', { class: 'component-stage' }, [stageToolbar, stageFrame]);

    const codeHost = el('div', { class: 'component-code__host' });
    const codeSplit = el('div', {
      class: 'component-code__split',
      attrs: {
        role: 'separator',
        'aria-orientation': 'horizontal',
        'aria-label': '拖动调整代码面板高度',
      },
    });
    const codeHead = el('div', { class: 'component-code__head' }, [
      el('strong', { text: '渲染代码' }),
      el('span', {
        class: 'component-code__hint',
        text: '只在 root 里绘制 · Ctrl/⌘+S 保存草稿 · Ctrl/⌘+Enter 刷新预览',
      }),
    ]);
    const codePanel = el('section', { class: 'component-code' }, [codeSplit, codeHead, codeHost]);
    codePanel.style.height = `${readCodeHeight()}px`;
    const problems = el('section', {
      class: 'component-problems',
      attrs: { 'aria-label': '体检结论', 'data-component-problem-list': '' },
    });
    const center = el('div', { class: 'component-editor__center' }, [stage, problems, codePanel]);
    const workspace = el('div', { class: 'component-editor__workspace' }, [left, center, right]);
    const page = el('div', { class: 'component-editor' }, [topbar, workspace]);
    main.append(page);

    // ———————— 改动管线 ————————

    const source = (): AtomicComponentSource =>
      templateText === undefined
        ? { spec, renderBody }
        : {
            // 不合法的 JSON 原样交给规格解析：体检会如实报「template 不是对象」，不阻止继续编辑。
            spec: {
              ...spec,
              template: readTemplateText(templateText).value as NonNullable<
                BaseScreenMaterialSpec['template']
              >,
            },
            renderBody: '',
          };

    /** 一次改动：标脏 → 排草稿保存 → 排预览与体检；按需重画左右栏（正在输入的那一栏不重画）。 */
    const changed = (options: { readonly left: boolean; readonly right: boolean }): void => {
      if (options.left) renderLeft();
      if (options.right) renderRight();
      saveState = 'dirty';
      renderSaveBadge();
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => void saveDraft(), AUTOSAVE_DELAY);
      scheduleRefresh();
    };

    const scheduleRefresh = (delay = REFRESH_DELAY): void => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refresh(), delay);
    };

    const refresh = async (): Promise<void> => {
      const token = ++refreshToken;
      const current = source();
      const [nextCompiled, nextFindings] = await Promise.all([
        compilePreview(current),
        auditAtomicComponent(current),
      ]);
      if (disposed || token !== refreshToken) return;
      findings = nextFindings;
      if (nextCompiled.ok) {
        compiled = nextCompiled.value;
        compileError = undefined;
      } else {
        compileError = nextCompiled.message;
      }
      paintPreview();
      renderProblems();
      if (selected === undefined) renderRight();
    };

    const saveDraft = async (): Promise<void> => {
      window.clearTimeout(saveTimer);
      if (saveState !== 'dirty' || type === '') return;
      saveState = 'saving';
      renderSaveBadge();
      const result = await saveAtomicDraft({
        type,
        source: source(),
        revision: draft?.revision ?? 0,
      });
      if (disposed) return;
      if (!result.ok) {
        saveState = result.code === 'REVISION_CONFLICT' ? 'conflict' : 'failed';
        renderSaveBadge();
        if (saveState === 'failed') {
          // 网络抖动：5 秒后重试一次；期间的新改动会让它重新变成「有改动」。
          saveTimer = window.setTimeout(() => {
            if (saveState !== 'failed') return;
            saveState = 'dirty';
            void saveDraft();
          }, 5000);
        }
        return;
      }
      draft = result.value;
      savedAt = new Date();
      // 别的改动在保存期间进来了：保持「有改动」，下一轮再存。
      saveState = saveState === 'saving' ? 'saved' : saveState;
      if (routeType === undefined && !window.location.hash.endsWith(encodeURIComponent(type))) {
        // 新建的组件第一次落库：地址换成它自己的，刷新后仍能回到这里（不触发路由重挂）。
        history.replaceState(null, '', `#/components/atomic/${encodeURIComponent(type)}`);
      }
      renderSaveBadge();
      renderMenu();
    };

    const leave = (go: () => void): void => {
      if (saveState === 'dirty') void saveDraft();
      go();
    };

    // ———————— 顶栏 ————————

    const renderSaveBadge = (): void => {
      const text: Record<SaveState, string> = {
        clean: pkg === undefined ? '未发布' : draft === undefined ? '已发布' : '有未发布改动',
        dirty: '有改动…',
        saving: '保存中…',
        saved: `草稿已保存 ${savedAt?.toLocaleTimeString() ?? ''}`.trim(),
        failed: '草稿保存失败，稍后重试',
        conflict: '已被其他会话修改，请重新载入',
      };
      saveBadge.textContent = text[saveState];
      saveBadge.dataset.state = saveState;
      publishButton.disabled = busy || saveState === 'conflict';
      publishButton.textContent = pkg === undefined ? '发布' : '发布新版本';
    };

    const renderMenu = (): void => {
      menuButton.setAttribute('aria-expanded', String(menuOpen));
      menu.hidden = !menuOpen;
      const items: HTMLElement[] = [
        menuItem('复制为新组件', () => void duplicate()),
        ...(pkg === undefined
          ? []
          : [
              menuItem(
                pkg.manifest.libraryVisible === false ? '上架' : '下架',
                () => void toggleVisibility(),
              ),
            ]),
        ...(pkg !== undefined && draft !== undefined
          ? [menuItem('放弃改动，回到已发布版本', () => void discard())]
          : []),
        ...(saveState === 'conflict' ? [menuItem('重新载入', () => window.location.reload())] : []),
        menuItem('删除组件', () => void remove(), true),
      ];
      menu.replaceChildren(...items);
    };

    const menuItem = (text: string, run: () => void, danger = false): HTMLElement =>
      el('button', {
        class: `component-editor__menu-item${danger ? ' component-editor__menu-item--danger' : ''}`,
        text,
        attrs: { type: 'button', role: 'menuitem' },
        on: {
          click: () => {
            menuOpen = false;
            renderMenu();
            run();
          },
        },
      });

    const renderProblems = (): void => {
      const errors = findings.filter((item) => item.severity === 'error').length;
      const warnings = findings.length - errors;
      problemsButton.textContent =
        findings.length === 0 ? '体检通过' : `体检 ${errors} 错误 · ${warnings} 警告`;
      problemsButton.dataset.tone = errors > 0 ? 'error' : warnings > 0 ? 'warning' : 'ok';
      problemsButton.setAttribute('aria-expanded', String(problemsOpen));
      problems.hidden = !problemsOpen;
      problems.replaceChildren(
        el('div', { class: 'component-problems__head' }, [
          el('strong', { text: '体检' }),
          el('span', {
            text:
              findings.length === 0 ? '符合组件范式，可以发布。' : '错误会阻止发布，警告只提示。',
          }),
          el('button', {
            class: 'button',
            text: '收起',
            attrs: { type: 'button' },
            on: {
              click: () => {
                problemsOpen = false;
                renderProblems();
              },
            },
          }),
        ]),
        el(
          'ul',
          { class: 'component-problems__list' },
          findings.map((finding) =>
            el(
              'li',
              { class: 'component-problems__item', attrs: { 'data-severity': finding.severity } },
              [
                el('span', {
                  class: 'component-problems__severity',
                  text: finding.severity === 'error' ? '错误' : '警告',
                }),
                el('span', { class: 'component-problems__message', text: finding.message }),
                el('button', {
                  class: 'button component-problems__locate',
                  text: '定位',
                  attrs: { type: 'button' },
                  on: { click: () => locate(finding) },
                }),
              ],
            ),
          ),
        ),
      );
    };

    const locate = (finding: BaseScreenAuthoringFinding): void => {
      const target = findingTarget(finding);
      switch (target.kind) {
        case 'field':
          if (target.index < spec.fields.length) {
            selected = target.index;
            renderLeft();
            renderRight();
          }
          return;
        case 'code': {
          code?.focus();
          codePanel.scrollIntoView({ block: 'nearest' });
          return;
        }
        case 'data':
          left.querySelector('[data-component-data]')?.scrollIntoView({ block: 'start' });
          return;
        case 'format':
          left.querySelector('[data-component-format]')?.scrollIntoView({ block: 'start' });
          return;
        default:
          selected = undefined;
          renderRight();
      }
    };

    // ———————— 左栏：结构 ————————

    const renderLeft = (): void => {
      left.replaceChildren(renderDataBlock(), renderFormatBlock(), renderFieldList());
    };

    const renderDataBlock = (): HTMLElement => {
      const data = spec.data;
      const block = panelBlock('数据', 'data');
      block.dataset.componentData = '';
      const options = el(
        'div',
        { class: 'component-choice-list', attrs: { role: 'group', 'aria-label': '数据形状' } },
        COMPONENT_DATA_OPTIONS.map((option) =>
          el('button', {
            class: 'component-choice',
            attrs: {
              type: 'button',
              'aria-pressed': String(data.kind === option.id),
              title: option.hint,
            },
            text: option.label,
            on: {
              click: () => {
                if (data.kind === option.id) return;
                spec = { ...spec, data: defaultData(option.id) };
                changed({ left: true, right: true });
              },
            },
          }),
        ),
      );
      block.append(options);
      if (data.kind === 'scalar') {
        block.append(
          row(
            '值的类型',
            select(
              [
                { value: 'number', label: '数字' },
                { value: 'string', label: '文字' },
              ],
              data.valueType,
              (value) => {
                const valueType = value === 'string' ? 'string' : 'number';
                spec = {
                  ...spec,
                  data: { kind: 'scalar', valueType, sample: valueType === 'number' ? 0 : '示例' },
                };
                changed({ left: true, right: false });
              },
            ),
          ),
          row(
            '示例值',
            textInput(String(data.sample), (value) => {
              spec = {
                ...spec,
                data: {
                  kind: 'scalar',
                  valueType: data.valueType,
                  sample: data.valueType === 'number' ? Number(value) : value,
                },
              };
              changed({ left: false, right: false });
            }),
          ),
        );
      }
      if (data.kind === 'rows') {
        block.append(renderRoles(data), renderRowsSample(data));
      }
      return block;
    };

    const renderRoles = (
      data: Extract<BaseScreenMaterialSpecData, { readonly kind: 'rows' }>,
    ): HTMLElement => {
      const update = (roles: readonly BaseScreenMaterialSpecRole[], redraw = true): void => {
        spec = { ...spec, data: { ...data, roles } };
        changed({ left: redraw, right: false });
      };
      const list = el('div', { class: 'component-roles' }, [
        el('div', { class: 'component-roles__head' }, [
          el('span', { text: '表格的列' }),
          el('span', { text: '代码里的名字' }),
          el('span', { text: '类型' }),
          el('span'),
        ]),
        ...data.roles.map((role, index) =>
          el('div', { class: 'component-roles__row' }, [
            textInput(role.label, (value) =>
              update(
                data.roles.map((item, at) => (at === index ? { ...item, label: value } : item)),
                false,
              ),
            ),
            textInput(role.id, (value) =>
              update(
                data.roles.map((item, at) => (at === index ? { ...item, id: value } : item)),
                false,
              ),
            ),
            select(
              [
                { value: 'number', label: '数字' },
                { value: 'string', label: '文字' },
              ],
              role.valueType,
              (value) =>
                update(
                  data.roles.map((item, at) =>
                    at === index
                      ? {
                          ...item,
                          valueType: value === 'string' ? ('string' as const) : ('number' as const),
                        }
                      : item,
                  ),
                ),
            ),
            iconButton('×', `删除列「${role.label}」`, () =>
              update(data.roles.filter((_, at) => at !== index)),
            ),
          ]),
        ),
        el('button', {
          class: 'button component-add',
          text: '+ 添加一列',
          attrs: { type: 'button' },
          on: {
            click: () =>
              update([
                ...data.roles,
                {
                  id: uniqueKey('column', new Set(data.roles.map((role) => role.id))),
                  label: '新列',
                  valueType: 'string',
                },
              ]),
          },
        }),
      ]);
      return list;
    };

    const renderRowsSample = (
      data: Extract<BaseScreenMaterialSpecData, { readonly kind: 'rows' }>,
    ): HTMLElement => {
      const area = el('textarea', {
        class: 'field component-sample',
        attrs: { rows: '6', spellcheck: 'false', 'aria-label': '示例行' },
      });
      area.value = JSON.stringify(data.sample, null, 2);
      const note = el('p', { class: 'component-hint' });
      area.addEventListener('input', () => {
        try {
          const sample: unknown = JSON.parse(area.value);
          if (!Array.isArray(sample)) throw new Error('not array');
          note.textContent = '';
          spec = { ...spec, data: { ...data, sample: sample as ScreenJsonObject[] } };
          changed({ left: false, right: false });
        } catch {
          note.textContent = '示例行需要是 JSON 数组，例如 [{ "name": "华东", "value": 120 }]。';
        }
      });
      return el('div', { class: 'component-row component-row--stack' }, [
        el('span', { class: 'component-row__label', text: '示例行（预览与新插入组件用）' }),
        area,
        note,
      ]);
    };

    const renderFormatBlock = (): HTMLElement => {
      const format = spec.numberFormat;
      const block = panelBlock('读数格式', 'format');
      block.dataset.componentFormat = '';
      block.append(
        checkbox('提供读数格式（小数位、单位、千分位）', format !== undefined, (checked) => {
          const { numberFormat: _drop, ...rest } = spec;
          spec = checked ? { ...rest, numberFormat: { decimals: 0 } } : rest;
          changed({ left: true, right: true });
        }),
      );
      if (format === undefined) return block;
      const patch = (next: BaseScreenMaterialSpecNumberFormat): void => {
        spec = { ...spec, numberFormat: next };
        changed({ left: false, right: true });
      };
      const affix = (key: 'prefix' | 'unit', label: string): HTMLElement => {
        const current = format[key];
        const text = textInput(typeof current === 'string' ? current : '', (value) =>
          patch(setAffix(format, key, value === '' ? true : value)),
        );
        text.disabled = current === undefined;
        return el('div', { class: 'component-row' }, [
          checkbox(label, current !== undefined, (checked) => {
            patch(setAffix(format, key, checked ? true : undefined));
            renderLeft();
          }),
          text,
        ]);
      };
      const followable = spec.fields.filter(
        (field) =>
          field.section === 'format' && (field.kind === 'boolean' || field.kind === 'choice'),
      );
      block.append(
        row(
          '默认小数位',
          numberInput(format.decimals ?? 0, { min: 0, max: 6, step: 1 }, (value) =>
            patch({ ...format, decimals: Math.max(0, Math.min(6, Math.trunc(value))) }),
          ),
        ),
        affix('prefix', '前缀'),
        affix('unit', '单位'),
        checkbox('千分位', format.thousandsSeparator !== undefined, (checked) => {
          const { thousandsSeparator: _drop, ...rest } = format;
          patch(checked ? { ...rest, thousandsSeparator: true } : rest);
        }),
        row(
          '仅当……时显示',
          select(
            [
              { value: '', label: '始终显示' },
              ...followable.map((field) => ({
                value: field.key,
                label: `「${field.label}」打开时`,
              })),
            ],
            format.visibleWhen?.key ?? '',
            (value) => {
              const { visibleWhen: _drop, ...rest } = format;
              const dependency = followable.find((field) => field.key === value);
              patch(
                dependency === undefined
                  ? rest
                  : {
                      ...rest,
                      visibleWhen: {
                        key: dependency.key,
                        equals:
                          dependency.kind === 'boolean' ? true : (dependency.options?.[0] ?? ''),
                      },
                    },
              );
            },
          ),
        ),
      );
      return block;
    };

    const renderFieldList = (): HTMLElement => {
      const block = panelBlock('可调项', 'fields');
      block.append(
        el('p', {
          class: 'component-hint',
          text: '每一项都会出现在检查器里；代码里用 props.名字（结构 / 读数格式 / 动效）或 style.名字（其余）读取。',
        }),
      );
      for (const section of COMPONENT_SECTION_OPTIONS) {
        const members = spec.fields
          .map((field, index) => ({ field, index }))
          .filter((item) => item.field.section === section.id);
        if (members.length === 0) continue;
        const group = el(
          'div',
          { class: 'component-field-group', attrs: { 'data-section': section.id } },
          [el('div', { class: 'component-field-group__title', text: section.label })],
        );
        for (const { field, index } of members) group.append(fieldRow(field, index));
        block.append(group);
      }
      const add = el('div', { class: 'component-add-row' }, [
        el('span', { class: 'component-row__label', text: '添加' }),
        ...COMPONENT_FIELD_KIND_OPTIONS.map((kind) =>
          el('button', {
            class: 'button component-add-kind',
            attrs: {
              type: 'button',
              title: `添加${kind.label}`,
              'data-component-add-field': kind.id,
            },
            text: `${kind.glyph} ${kind.label}`,
            on: { click: () => addField(kind.id) },
          }),
        ),
      ]);
      block.append(add);
      return block;
    };

    const fieldRow = (field: Field, index: number): HTMLElement => {
      const kind = COMPONENT_FIELD_KIND_OPTIONS.find((item) => item.id === field.kind);
      const item = el(
        'button',
        {
          class: 'component-field',
          attrs: {
            type: 'button',
            draggable: 'true',
            title: 'Alt + ↑ / ↓ 在组内移动',
            'data-selected': String(selected === index),
            'aria-pressed': String(selected === index),
            'data-component-field': field.key,
          },
          on: {
            click: () => selectField(index),
            keydown: (event) => {
              const key = (event as KeyboardEvent).key;
              if ((event as KeyboardEvent).altKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
                event.preventDefault();
                moveField(index, key === 'ArrowUp' ? -1 : 1);
              }
            },
            dragstart: (event) => {
              (event as DragEvent).dataTransfer?.setData('text/x-component-field', String(index));
            },
            dragover: (event) => event.preventDefault(),
            drop: (event) => {
              event.preventDefault();
              const from = Number(
                (event as DragEvent).dataTransfer?.getData('text/x-component-field'),
              );
              if (Number.isInteger(from) && from !== index) reorder(from, index);
            },
          },
        },
        [
          el('span', {
            class: 'component-field__glyph',
            text: kind?.glyph ?? '?',
            attrs: { 'aria-hidden': 'true' },
          }),
          el('span', { class: 'component-field__label', text: field.label }),
          el('span', { class: 'component-field__default', text: defaultSummary(field) }),
          ...(field.visibleWhen === undefined
            ? []
            : [
                el('span', {
                  class: 'component-field__when',
                  text: '条件',
                  attrs: { title: '仅在条件满足时显示' },
                }),
              ]),
        ],
      );
      return item;
    };

    const selectField = (index: number | undefined): void => {
      selected = index;
      renderLeft();
      renderRight();
      if (index !== undefined) {
        left
          .querySelector<HTMLElement>(`[data-component-field="${spec.fields[index]?.key ?? ''}"]`)
          ?.focus();
      }
    };

    const setFields = (
      fields: readonly Field[],
      redraw: { left: boolean; right: boolean },
    ): void => {
      spec = { ...spec, fields: sortBySection(fields) };
      changed(redraw);
    };

    const addField = (kind: Field['kind']): void => {
      const keys = new Set(spec.fields.map((field) => field.key));
      const field = retype(
        {
          key: uniqueKey(kind === 'color' ? 'color' : 'option', keys),
          label: '新可调项',
          section: 'structure',
          kind: 'text',
          default: '',
        },
        kind,
      );
      const fields = sortBySection([...spec.fields, field]);
      spec = { ...spec, fields };
      selected = fields.findIndex((item) => item.key === field.key);
      changed({ left: true, right: true });
    };

    const removeField = (index: number): void => {
      const field = spec.fields[index];
      if (field === undefined) return;
      selected = undefined;
      const fields = spec.fields
        .filter((_, at) => at !== index)
        .map((item) => (item.visibleWhen?.key === field.key ? withoutWhen(item) : item));
      const format = spec.numberFormat;
      if (format?.visibleWhen?.key === field.key) {
        const { visibleWhen: _drop, ...rest } = format;
        spec = { ...spec, numberFormat: rest };
      }
      setFields(fields, { left: true, right: true });
      showToast(`已删除「${field.label}」`, 'info');
    };

    const moveField = (index: number, delta: number): void => {
      const target = index + delta;
      const field = spec.fields[index];
      const other = spec.fields[target];
      if (field === undefined || other === undefined || other.section !== field.section) return;
      reorder(index, target);
    };

    const reorder = (from: number, to: number): void => {
      const fields = [...spec.fields];
      const [moved] = fields.splice(from, 1);
      if (moved === undefined) return;
      const target = fields[Math.min(to, fields.length - 1)];
      // 拖到别的分组里：跟随落点所在的分组（颜色字段只能落在外观类分组）。
      const section =
        target !== undefined &&
        target.section !== moved.section &&
        !(moved.kind === 'color' && PROPS_SECTIONS.has(target.section))
          ? target.section
          : moved.section;
      fields.splice(to, 0, { ...moved, section });
      const next = sortBySection(fields);
      selected = next.findIndex((field) => field.key === moved.key);
      setFields(next, { left: true, right: true });
    };

    // ———————— 右栏：检查器 ————————

    const renderRight = (): void => {
      const field = selected === undefined ? undefined : spec.fields[selected];
      right.replaceChildren(
        field === undefined || selected === undefined
          ? renderInspector()
          : renderFieldForm(field, selected),
      );
    };

    const renderFieldForm = (field: Field, index: number): HTMLElement => {
      const replace = (next: Field, redrawRight = false): void => {
        const previousKey = field.key;
        const fields = spec.fields.map((item, at) => {
          if (at === index) return next;
          // 改名：引用它的显示条件一起改，避免悬空。
          if (previousKey !== next.key && item.visibleWhen?.key === previousKey) {
            return { ...item, visibleWhen: { key: next.key, equals: item.visibleWhen.equals } };
          }
          return item;
        });
        const sorted = sortBySection(fields);
        selected = sorted.findIndex((item) => item.key === next.key);
        spec = { ...spec, fields: sorted };
        changed({ left: true, right: redrawRight });
      };
      const keyInput = textInput(field.key, (value) => {
        keyNote.textContent = KEY_PATTERN.test(value)
          ? ''
          : '小写字母开头，只用字母和数字（如 fillColor）。';
        replace({ ...field, key: value });
      });
      const keyNote = el('p', { class: 'component-hint component-hint--warn' });
      const sections = COMPONENT_SECTION_OPTIONS.filter(
        (section) => field.kind !== 'color' || !PROPS_SECTIONS.has(section.id),
      );
      const earlier = spec.fields
        .slice(0, index)
        .filter((item) => item.kind === 'boolean' || item.kind === 'choice');
      const dependency = earlier.find((item) => item.key === field.visibleWhen?.key);
      const form = el(
        'div',
        { class: 'component-inspector', attrs: { 'data-component-field-form': field.key } },
        [
          el('div', { class: 'component-inspector__head' }, [
            el('button', {
              class: 'button',
              text: '← 检查器',
              attrs: { type: 'button' },
              on: { click: () => selectField(undefined) },
            }),
            el('strong', { text: '可调项' }),
            el('span', { class: 'component-library__spacer' }),
            el('button', {
              class: 'button button--danger',
              text: '删除',
              attrs: { type: 'button' },
              on: { click: () => removeField(index) },
            }),
          ]),
          row(
            '名称',
            textInput(field.label, (value) => replace({ ...field, label: value })),
          ),
          row('代码里的名字', keyInput),
          keyNote,
          row(
            '控件类型',
            select(
              COMPONENT_FIELD_KIND_OPTIONS.map((kind) => ({
                value: kind.id,
                label: `${kind.glyph} ${kind.label}`,
              })),
              field.kind,
              (value) => {
                const kind =
                  COMPONENT_FIELD_KIND_OPTIONS.find((item) => item.id === value)?.id ?? field.kind;
                // 类型变了：依赖它的显示条件取值也会失效，一并去掉。
                const next = retype(field, kind);
                const fields = spec.fields.map((item, at) =>
                  at === index
                    ? next
                    : item.visibleWhen?.key === field.key
                      ? withoutWhen(item)
                      : item,
                );
                const sorted = sortBySection(fields);
                selected = sorted.findIndex((item) => item.key === next.key);
                spec = { ...spec, fields: sorted };
                changed({ left: true, right: true });
              },
            ),
          ),
          row(
            '放在检查器的哪一组',
            select(
              sections.map((section) => ({ value: section.id, label: section.label })),
              field.section,
              (value) => {
                const section = sections.find((item) => item.id === value)?.id ?? field.section;
                replace({ ...field, section }, true);
              },
            ),
          ),
          row(
            '默认值',
            defaultEditor(field, (value) => replace({ ...field, default: value } as Field)),
          ),
          ...kindSpecificRows(field, (next) => replace(next, true)),
          row(
            '仅当……时显示',
            select(
              [
                { value: '', label: '始终显示' },
                ...earlier.map((item) => ({ value: item.key, label: `「${item.label}」` })),
              ],
              dependency?.key ?? '',
              (value) => {
                const target = earlier.find((item) => item.key === value);
                replace(
                  target === undefined
                    ? withoutWhen(field)
                    : {
                        ...field,
                        visibleWhen: {
                          key: target.key,
                          equals: target.kind === 'boolean' ? true : (target.options?.[0] ?? ''),
                        },
                      },
                  true,
                );
              },
            ),
          ),
          ...(dependency === undefined || field.visibleWhen === undefined
            ? []
            : [
                row(
                  '等于',
                  dependency.kind === 'boolean'
                    ? select(
                        [
                          { value: 'true', label: '打开' },
                          { value: 'false', label: '关闭' },
                        ],
                        String(field.visibleWhen.equals),
                        (value) =>
                          replace({
                            ...field,
                            visibleWhen: { key: dependency.key, equals: value === 'true' },
                          }),
                      )
                    : select(
                        (dependency.options ?? []).map((option) => ({
                          value: option,
                          label: option,
                        })),
                        String(field.visibleWhen.equals),
                        (value) =>
                          replace({
                            ...field,
                            visibleWhen: { key: dependency.key, equals: value },
                          }),
                      ),
                ),
              ]),
          row(
            '说明（悬停显示）',
            textInput(field.help ?? '', (value) => {
              const { help: _drop, ...rest } = field;
              replace(value === '' ? (rest as Field) : { ...field, help: value });
            }),
          ),
        ],
      );
      return form;
    };

    const kindSpecificRows = (field: Field, replace: (next: Field) => void): HTMLElement[] => {
      if (field.kind === 'number') {
        const bound = (key: 'min' | 'max' | 'step', label: string): HTMLElement =>
          row(
            label,
            textInput(field[key] === undefined ? '' : String(field[key]), (value) => {
              const numeric = Number(value);
              replace(
                setBound(
                  field,
                  key,
                  value.trim() === '' || !Number.isFinite(numeric) ? undefined : numeric,
                ),
              );
            }),
          );
        return [
          bound('min', '最小值'),
          bound('max', '最大值'),
          bound('step', '步长'),
          row(
            '单位',
            textInput(field.unit ?? '', (value) => {
              const { unit: _drop, ...rest } = field;
              replace(value === '' ? (rest as Field) : { ...field, unit: value });
            }),
          ),
        ];
      }
      if (field.kind === 'choice') {
        const area = el('textarea', {
          class: 'field component-options',
          attrs: { rows: '4', 'aria-label': '选项，每行一个' },
        });
        area.value = (field.options ?? []).join('\n');
        area.addEventListener('change', () => {
          const options = [
            ...new Set(
              area.value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            ),
          ];
          const fallback = options[0] ?? '';
          replace({
            ...field,
            options,
            default: options.includes(String(field.default)) ? field.default : fallback,
          });
        });
        return [row('选项（每行一个）', area)];
      }
      if (field.kind === 'color') {
        return [
          checkbox('允许渐变', field.allowGradient === true, (checked) => {
            const { allowGradient: _drop, ...rest } = field;
            replace(checked ? { ...field, allowGradient: true } : (rest as Field));
          }),
        ];
      }
      return [];
    };

    /** 检查器预览：按编译出的描述符分组呈现，作者在这里直接改默认值（所见即所用）。 */
    const renderInspector = (): HTMLElement => {
      const panel = el('div', {
        class: 'component-inspector',
        attrs: { 'data-component-inspector': '' },
      });
      panel.append(
        el('div', { class: 'component-inspector__head' }, [
          el('strong', { text: '检查器' }),
          el('span', { class: 'component-hint', text: '使用者看到的就是这里；改动即默认值' }),
        ]),
        renderBasics(),
      );
      if (compiled === undefined) {
        panel.append(el('p', { class: 'component-hint', text: compileError ?? '正在生成…' }));
        return panel;
      }
      panel.append(
        el('div', {
          class: 'component-inspector__common',
          text: '公共区：位置、尺寸、旋转、不透明度、翻转（设计器统一提供）',
        }),
      );
      const defaults = {
        props: compiled.manifest.defaultProps,
        style: compiled.manifest.defaultStyle,
      };
      for (const section of compiled.manifest.editorDescriptor?.appearance ?? []) {
        const visibleFields = section.fields.filter((field) => conditionHolds(field, defaults));
        if (visibleFields.length === 0) continue;
        const group = el('details', { class: 'component-inspector__section' });
        group.open = section.collapsed !== true && section.advanced !== true;
        group.append(
          el('summary', {
            text: `${section.label}${section.advanced === true ? ' · 高级' : section.collapsed === true ? ' · 默认收起' : ''}`,
          }),
        );
        for (const field of visibleFields) {
          const key = String(field.path[0] ?? field.id);
          group.append(row(field.label, inspectorControl(key, field)));
        }
        panel.append(group);
      }
      if (spec.data.kind !== 'none') {
        panel.append(
          el('div', {
            class: 'component-inspector__common',
            text:
              spec.data.kind === 'scalar'
                ? '数据页：静态值 / 变量 / 数据集（绑定一列）'
                : `数据页：静态表 / 数据集；按列绑定：${spec.data.roles.map((role) => role.label).join('、')}`,
          }),
        );
      }
      return panel;
    };

    const renderBasics = (): HTMLElement => {
      const block = el('details', { class: 'component-inspector__section' });
      block.open = true;
      block.append(
        el('summary', { text: '组件信息' }),
        row(
          '分类',
          textInput(spec.category, (value) => {
            spec = { ...spec, category: value };
            changed({ left: false, right: false });
          }),
        ),
        row(
          '关键词',
          textInput(spec.keywords.join('，'), (value) => {
            spec = {
              ...spec,
              keywords: value
                .split(/[,，、\s]+/)
                .map((item) => item.trim())
                .filter(Boolean)
                .slice(0, 16),
            };
            changed({ left: false, right: false });
          }),
        ),
        row(
          '默认尺寸',
          el('span', { class: 'component-inspector__size' }, [
            numberInput(spec.defaultSize.width, { min: 8, max: 4096, step: 1 }, (value) =>
              setDefaultSize({ ...spec.defaultSize, width: value }),
            ),
            el('span', { text: '×' }),
            numberInput(spec.defaultSize.height, { min: 8, max: 4096, step: 1 }, (value) =>
              setDefaultSize({ ...spec.defaultSize, height: value }),
            ),
          ]),
        ),
        checkbox('允许旋转', spec.rotate !== false, (checked) => {
          const { rotate: _drop, ...rest } = spec;
          spec = checked ? rest : { ...rest, rotate: false };
          changed({ left: false, right: false });
        }),
      );
      return block;
    };

    const inspectorControl = (key: string, field: DescriptorFieldView): HTMLElement => {
      const index = spec.fields.findIndex((item) => item.key === key);
      const own = spec.fields[index];
      if (own !== undefined) {
        const editor = defaultEditor(own, (value) => {
          spec = {
            ...spec,
            fields: spec.fields.map((item, at) =>
              at === index ? ({ ...item, default: value } as Field) : item,
            ),
          };
          changed({ left: true, right: false });
        });
        editor.title = own.help ?? '';
        return editor;
      }
      // 读数格式配置组的字段：默认值写回 numberFormat。
      const format = spec.numberFormat ?? {};
      const writeFormat = (next: BaseScreenMaterialSpecNumberFormat): void => {
        spec = { ...spec, numberFormat: next };
        changed({ left: true, right: false });
      };
      if (key === 'decimals') {
        return numberInput(format.decimals ?? 0, { min: 0, max: 6, step: 1 }, (value) =>
          writeFormat({ ...format, decimals: Math.max(0, Math.min(6, Math.trunc(value))) }),
        );
      }
      if (key === 'prefix' || key === 'unit') {
        const current = format[key];
        return textInput(typeof current === 'string' ? current : '', (value) =>
          writeFormat(setAffix(format, key, value === '' ? true : value)),
        );
      }
      if (key === 'thousandsSeparator') {
        const box = el('input', { attrs: { type: 'checkbox', 'aria-label': field.label } });
        box.checked = format.thousandsSeparator === true;
        box.addEventListener('change', () =>
          writeFormat({ ...format, thousandsSeparator: box.checked }),
        );
        return box;
      }
      return el('span', { class: 'component-hint', text: field.control ?? field.label });
    };

    const setDefaultSize = (size: ScreenSize): void => {
      const width = clamp(Math.round(size.width), 8, 4096);
      const height = clamp(Math.round(size.height), 8, 4096);
      spec = { ...spec, defaultSize: { width, height } };
      previewSize = { width, height };
      changed({ left: false, right: false });
      paintPreview();
    };

    // ———————— 中栏：预览 ————————

    const renderStageToolbar = (): void => {
      stageToolbar.replaceChildren(
        segmented(
          '数据状态',
          [
            { value: 'ready', label: '就绪' },
            { value: 'loading', label: '加载中' },
            { value: 'empty', label: '空数据' },
            { value: 'error', label: '出错' },
          ],
          previewMode,
          (value) => {
            previewMode = value as PreviewDataMode;
            renderStageToolbar();
            paintPreview();
          },
        ),
        segmented(
          '背景',
          [
            { value: 'screen', label: '大屏' },
            { value: 'dark', label: '深色' },
            { value: 'light', label: '浅色' },
          ],
          backdrop,
          (value) => {
            backdrop = value as Backdrop;
            renderStageToolbar();
            paintPreview();
          },
        ),
        segmented(
          '缩放',
          [
            { value: 'fit', label: '适应' },
            { value: 'actual', label: '100%' },
          ],
          zoom,
          (value) => {
            zoom = value === 'actual' ? 'actual' : 'fit';
            renderStageToolbar();
            paintPreview();
          },
        ),
        el('span', { class: 'component-library__spacer' }),
        sizeLabel,
        el('button', {
          class: 'button',
          text: '设为默认尺寸',
          attrs: { type: 'button', 'data-component-size-default': '' },
          on: { click: () => setDefaultSize(previewSize) },
        }),
      );
    };

    const paintPreview = (): void => {
      stageFrame.dataset.backdrop = backdrop;
      sizeLabel.textContent = `${previewSize.width} × ${previewSize.height}`;
      const sameAsDefault =
        previewSize.width === spec.defaultSize.width &&
        previewSize.height === spec.defaultSize.height;
      sizeLabel.dataset.custom = String(!sameAsDefault);
      stageBox.style.width = `${previewSize.width}px`;
      stageBox.style.height = `${previewSize.height}px`;
      const available = {
        width: Math.max(80, stageFrame.clientWidth - 64),
        height: Math.max(80, stageFrame.clientHeight - 64),
      };
      const scale =
        zoom === 'actual'
          ? 1
          : Math.min(1, available.width / previewSize.width, available.height / previewSize.height);
      stageBox.style.transform = `scale(${scale})`;
      previewNote.textContent = scale < 1 ? `已缩放到 ${Math.round(scale * 100)}%` : '';
      if (compiled === undefined || compileError !== undefined) {
        stageBox.dataset.broken = 'true';
        previewNote.textContent = compileError ?? '正在生成预览…';
        // 保留上一帧：出错时不闪白，只标出状态。
        return;
      }
      stageBox.dataset.broken = 'false';
      renderPreview(stageMount, { compiled, size: previewSize, mode: previewMode });
    };

    // 拖拽改尺寸：右下角手柄，Shift 保持比例。
    sizeHandle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      sizeHandle.setPointerCapture(event.pointerId);
      const start = { x: event.clientX, y: event.clientY, ...previewSize };
      const ratio = start.width / start.height;
      const scale = stageBox.getBoundingClientRect().width / previewSize.width || 1;
      const move = (next: PointerEvent): void => {
        const width = clamp(Math.round(start.width + (next.clientX - start.x) / scale), 8, 4096);
        const free = clamp(Math.round(start.height + (next.clientY - start.y) / scale), 8, 4096);
        const height = next.shiftKey ? clamp(Math.round(width / ratio), 8, 4096) : free;
        if (width === previewSize.width && height === previewSize.height) return;
        previewSize = { width, height };
        paintPreview();
      };
      const up = (): void => {
        sizeHandle.removeEventListener('pointermove', move);
        sizeHandle.removeEventListener('pointerup', up);
      };
      sizeHandle.addEventListener('pointermove', move);
      sizeHandle.addEventListener('pointerup', up);
    });

    // 代码面板高度：拖动分隔条，记在本机。
    codeSplit.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      codeSplit.setPointerCapture(event.pointerId);
      const startY = event.clientY;
      const startHeight = codePanel.getBoundingClientRect().height;
      const move = (next: PointerEvent): void => {
        const height = clamp(
          startHeight - (next.clientY - startY),
          160,
          Math.max(200, center.clientHeight - 160),
        );
        codePanel.style.height = `${height}px`;
      };
      const up = (): void => {
        codeSplit.removeEventListener('pointermove', move);
        codeSplit.removeEventListener('pointerup', up);
        writeCodeHeight(codePanel.getBoundingClientRect().height);
        paintPreview();
      };
      codeSplit.addEventListener('pointermove', move);
      codeSplit.addEventListener('pointerup', up);
    });

    const resizeObserver = new ResizeObserver(() => {
      if (zoom === 'fit') paintPreview();
    });
    resizeObserver.observe(stageFrame);

    // ———————— 发布与管理 ————————

    const withBusy = async (work: () => Promise<void>): Promise<void> => {
      if (busy) return;
      busy = true;
      renderSaveBadge();
      try {
        await work();
      } finally {
        busy = false;
        if (!disposed) renderSaveBadge();
      }
    };

    const confirmPublish = (): Promise<void> =>
      withBusy(async () => {
        window.clearTimeout(refreshTimer);
        await refresh();
        const errors = findings.filter((item) => item.severity === 'error');
        if (errors.length > 0) {
          problemsOpen = true;
          renderProblems();
          const first = errors[0];
          if (first !== undefined) locate(first);
          showToast(`体检有 ${errors.length} 个错误，修正后再发布。`, 'error');
          return;
        }
        const warnings = findings.length - errors.length;
        const ok = await confirmDialog({
          title: pkg === undefined ? `发布「${spec.name}」` : `发布「${spec.name}」的新版本`,
          lines: [
            pkg === undefined
              ? '发布后出现在所有大屏的物料库里。'
              : `正在被 ${references.length} 张大屏使用；打开这些大屏时会用新代码渲染，已有组件的配置保留。`,
            ...(warnings > 0 ? [`体检有 ${warnings} 条警告（不阻止发布）。`] : []),
            '改动不会自动回滚；之后可以继续修改再发布。',
          ],
          confirm: '发布',
        });
        if (!ok) return;
        const result = await publishAtomicComponent({ type, source: source(), pkg });
        if (!result.ok) {
          if (result.findings !== undefined) {
            findings = result.findings;
            problemsOpen = true;
            renderProblems();
          }
          showToast(`发布失败：${result.message}`, 'error');
          return;
        }
        pkg = result.value;
        draft = undefined;
        published = source();
        window.clearTimeout(saveTimer);
        saveState = 'clean';
        if (routeType === undefined)
          history.replaceState(null, '', `#/components/atomic/${encodeURIComponent(type)}`);
        renderSaveBadge();
        renderMenu();
        showToast(`「${spec.name}」已发布，物料库已更新`, 'success');
      });

    const toggleVisibility = (): Promise<void> =>
      withBusy(async () => {
        if (pkg === undefined) return;
        const visible = pkg.manifest.libraryVisible === false;
        const result = await setAtomicVisibility(pkg, visible);
        if (!result.ok) {
          showToast(`${visible ? '上架' : '下架'}失败：${result.message}`, 'error');
          return;
        }
        pkg = result.value;
        renderMenu();
        showToast(visible ? '已上架' : '已下架：物料库不再显示，已有大屏照常渲染', 'success');
      });

    const discard = (): Promise<void> =>
      withBusy(async () => {
        if (published === undefined) return;
        const ok = await confirmDialog({
          title: '放弃未发布的改动',
          lines: ['回到已发布版本，草稿会被删除。'],
          confirm: '放弃改动',
          danger: true,
        });
        if (!ok) return;
        const result = await discardAtomicDraft(type);
        if (!result.ok) {
          showToast(`操作失败：${result.message}`, 'error');
          return;
        }
        draft = undefined;
        window.clearTimeout(saveTimer);
        applySource(published);
        saveState = 'clean';
        renderAll();
      });

    const duplicate = (): Promise<void> =>
      withBusy(async () => {
        const nextType = createAtomicComponentType(type.slice('host.online.'.length) || spec.name);
        const result = await saveAtomicDraft({
          type: nextType,
          source: {
            ...source(),
            spec: { ...source().spec, type: nextType, name: `${spec.name} 副本` },
          },
          revision: 0,
        });
        if (!result.ok) {
          showToast(`复制失败：${result.message}`, 'error');
          return;
        }
        leave(() => goToAtomicComponent(nextType));
      });

    const remove = (): Promise<void> =>
      withBusy(async () => {
        const ok = await confirmDialog({
          title: `删除「${spec.name}」`,
          lines: [
            pkg === undefined
              ? '组件还没有发布，删除后草稿不可恢复。'
              : references.length > 0
                ? `正在被 ${references.length} 张大屏使用，不能删除；可以改为下架。`
                : '删除后物料库不再提供它，不可恢复。',
          ],
          confirm: '删除',
          danger: true,
        });
        if (!ok) return;
        const result = await deleteAtomicComponent({
          kind: 'atomic',
          type,
          name: spec.name,
          category: spec.category,
          keywords: spec.keywords,
          status: pkg === undefined ? 'unpublished' : 'listed',
          hasDraft: draft !== undefined,
          pkg,
          draft,
          references,
          updatedAt: '',
          working: source(),
          published,
        });
        if (!result.ok) {
          const screens = result.references ?? [];
          await confirmDialog({
            title: '不能删除',
            lines: [
              result.code === 'MATERIAL_IN_USE'
                ? `仍被这些大屏引用：${screens.map((screen) => screen.name).join('、')}。可以先下架。`
                : result.message,
            ],
            confirm: '知道了',
            cancel: false,
            links: screens.map((screen) => ({
              label: `打开「${screen.name}」`,
              run: () => goToEdit(screen.id),
            })),
          });
          return;
        }
        window.clearTimeout(saveTimer);
        saveState = 'clean';
        showToast(`已删除「${spec.name}」`, 'success');
        goToComponents();
      });

    // ———————— 载入 ————————

    const applySource = (next: AtomicComponentSource): void => {
      const { template, ...rest } = next.spec;
      spec = isTemplateComponentSource(next) ? (rest as BaseScreenMaterialSpec) : next.spec;
      renderBody = next.renderBody;
      templateText =
        template === undefined
          ? undefined
          : typeof template === 'string'
            ? template
            : JSON.stringify(template, null, 2);
      previewSize = isSize(spec.defaultSize)
        ? { ...spec.defaultSize }
        : { width: 240, height: 120 };
      code?.setValue(templateText ?? renderBody);
      selected = undefined;
    };

    const renderAll = (): void => {
      nameInput.value = typeof spec.name === 'string' ? spec.name : '';
      renderSaveBadge();
      renderMenu();
      renderLeft();
      renderRight();
      renderStageToolbar();
      renderProblems();
      scheduleRefresh(0);
    };

    const start = async (): Promise<void> => {
      if (routeType === undefined) {
        // 中文名 slug 为空：用模板 id 作类型前缀，类型更可读（host.online.ring-xxxx）。
        type = createAtomicComponentType(template.id);
        applySource(template.build(type));
        saveState = 'dirty';
        mountCode();
        renderAll();
        renderSaveBadge();
        // 新建即存一份草稿：组件库里马上能看到它，刷新也不丢。
        void saveDraft();
        return;
      }
      type = routeType;
      const library = await loadComponentLibrary(controller.signal);
      if (disposed) return;
      const item = library.ok
        ? library.value.atomic.find((candidate) => candidate.type === type)
        : undefined;
      if (item === undefined || item.working === undefined) {
        page.replaceChildren(
          el('div', { class: 'page ds-page' }, [
            el('div', { class: 'error-banner', attrs: { role: 'alert' } }, [
              el('span', {
                class: 'error-banner__message',
                text: library.ok
                  ? '组件不存在、已被删除或源码无法读取。'
                  : (library.diagnostics[0]?.message ?? '读取失败。'),
              }),
              el('button', { class: 'button', text: '返回组件库', on: { click: goToComponents } }),
            ]),
          ]),
        );
        return;
      }
      pkg = item.pkg;
      draft = item.draft;
      published = item.published;
      references = item.references;
      applySource(item.working);
      mountCode();
      renderAll();
    };

    const mountCode = (): void => {
      if (code !== undefined) return;
      const template = templateText !== undefined;
      codeHead.replaceChildren(
        el('strong', { text: template ? '模板（JSON）' : '渲染代码' }),
        el('span', {
          class: 'component-code__hint',
          text: template
            ? '受限 SVG 图元 + 绑定表达式，不含代码 · Ctrl/⌘+S 保存草稿 · Ctrl/⌘+Enter 刷新预览'
            : '只在 root 里绘制 · Ctrl/⌘+S 保存草稿 · Ctrl/⌘+Enter 刷新预览',
        }),
      );
      codePanel.dataset.componentCodeMode = template ? 'template' : 'render';
      code = createCodeEditor({
        value: templateText ?? renderBody,
        completions: template ? [] : RENDER_CONTEXT_COMPLETIONS,
        language: template ? 'json' : 'javascript',
        onChange: (value) => {
          if (templateText !== undefined) templateText = value;
          else renderBody = value;
          changed({ left: false, right: false });
        },
        onSave: () => void saveDraft(),
        onRun: () => scheduleRefresh(0),
      });
      codeHost.replaceChildren(code.element);
    };

    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (saveState === 'dirty' || saveState === 'saving' || saveState === 'failed') {
        event.preventDefault();
      }
    };
    const onDocumentClick = (event: MouseEvent): void => {
      if (
        menuOpen &&
        !(event.target instanceof Node && menu.parentElement?.contains(event.target))
      ) {
        menuOpen = false;
        renderMenu();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onDocumentClick);

    renderStageToolbar();
    void start();

    return () => {
      if (saveState === 'dirty') void saveDraft();
      disposed = true;
      controller.abort();
      window.clearTimeout(refreshTimer);
      resizeObserver.disconnect();
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onDocumentClick);
      code?.destroy();
      for (const overlay of document.querySelectorAll('[data-component-dialog]')) overlay.remove();
    };
  },
};

// ———————————————————————————— 规格小工具 ————————————————————————————

function sortBySection(fields: readonly Field[]): Field[] {
  const order = new Map(COMPONENT_SECTION_OPTIONS.map((section, index) => [section.id, index]));
  return fields
    .map((field, index) => ({ field, index }))
    .sort(
      (left, right) =>
        (order.get(left.field.section) ?? 0) - (order.get(right.field.section) ?? 0) ||
        left.index - right.index,
    )
    .map((item) => item.field);
}

/** 设置或去掉读数格式的前缀 / 单位（`undefined` 去掉，`true` 只提供字段，字符串同时是默认值）。 */
function setAffix(
  format: BaseScreenMaterialSpecNumberFormat,
  key: 'prefix' | 'unit',
  value: boolean | string | undefined,
): BaseScreenMaterialSpecNumberFormat {
  const { prefix, unit, ...rest } = format;
  const nextPrefix = key === 'prefix' ? value : prefix;
  const nextUnit = key === 'unit' ? value : unit;
  return {
    ...rest,
    ...(nextPrefix === undefined ? {} : { prefix: nextPrefix }),
    ...(nextUnit === undefined ? {} : { unit: nextUnit }),
  };
}

/** 设置或去掉数字可调项的最小值 / 最大值 / 步长。 */
function setBound(field: Field, key: 'min' | 'max' | 'step', value: number | undefined): Field {
  const { min, max, step, ...rest } = field;
  const next = {
    min: key === 'min' ? value : min,
    max: key === 'max' ? value : max,
    step: key === 'step' ? value : step,
  };
  return {
    ...rest,
    ...(next.min === undefined ? {} : { min: next.min }),
    ...(next.max === undefined ? {} : { max: next.max }),
    ...(next.step === undefined ? {} : { step: next.step }),
  };
}

function withoutWhen(field: Field): Field {
  const { visibleWhen: _drop, ...rest } = field;
  return rest as Field;
}

/** 换控件类型：只保留各类型共有的定义，默认值换成该类型的合理初值；颜色只能落在外观类分组。 */
function retype(field: Field, kind: Field['kind']): Field {
  const base = {
    key: field.key,
    label: field.label,
    section:
      kind === 'color' && PROPS_SECTIONS.has(field.section) ? ('surface' as const) : field.section,
    ...(field.help === undefined ? {} : { help: field.help }),
    ...(field.visibleWhen === undefined ? {} : { visibleWhen: field.visibleWhen }),
  };
  switch (kind) {
    case 'number':
      return { ...base, kind, default: typeof field.default === 'number' ? field.default : 0 };
    case 'boolean':
      return { ...base, kind, default: field.default === true };
    case 'color':
      return {
        ...base,
        kind,
        default:
          typeof field.default === 'string' && field.default.startsWith('#')
            ? field.default
            : '#38bdf8',
      };
    case 'choice':
      return { ...base, kind, options: ['选项一', '选项二'], default: '选项一' };
    default:
      return {
        ...base,
        kind: 'text',
        default: typeof field.default === 'string' ? field.default : '',
      };
  }
}

function defaultData(kind: BaseScreenMaterialSpecData['kind']): BaseScreenMaterialSpecData {
  switch (kind) {
    case 'scalar':
      return { kind: 'scalar', valueType: 'number', sample: 42 };
    case 'rows':
      return {
        kind: 'rows',
        roles: [
          { id: 'name', label: '名称', valueType: 'string' },
          { id: 'value', label: '数值', valueType: 'number' },
        ],
        sample: [
          { name: '甲', value: 120 },
          { name: '乙', value: 80 },
        ],
      };
    default:
      return { kind: 'none' };
  }
}

function defaultSummary(field: Field): string {
  if (field.kind === 'boolean') return field.default === true ? '开' : '关';
  const text = String(field.default);
  return `${text.length > 12 ? `${text.slice(0, 12)}…` : text}${field.kind === 'number' && field.unit !== undefined ? field.unit : ''}`;
}

function uniqueKey(base: string, existing: ReadonlySet<string>): string {
  for (let index = 1; ; index += 1) {
    const key = `${base}${index}`;
    if (!existing.has(key)) return key;
  }
}

function conditionHolds(
  field: DescriptorFieldView,
  defaults: { readonly props: ScreenJsonObject; readonly style: ScreenJsonObject },
): boolean {
  for (const condition of field.when ?? []) {
    const key = String(condition.path[0] ?? '');
    const value = defaults.props[key] ?? defaults.style[key];
    if (condition.operator === 'eq' && value !== condition.value) return false;
  }
  return true;
}

function isSize(value: unknown): value is ScreenSize {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as ScreenSize).width === 'number' &&
    typeof (value as ScreenSize).height === 'number'
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readHashParam(name: string): string | undefined {
  const hash = window.location.hash;
  const index = hash.indexOf('?');
  if (index < 0) return undefined;
  return new URLSearchParams(hash.slice(index + 1)).get(name) ?? undefined;
}

function readCodeHeight(): number {
  try {
    const value = Number(localStorage.getItem(CODE_HEIGHT_KEY));
    return Number.isFinite(value) && value >= 160 ? value : 280;
  } catch {
    return 280;
  }
}

function writeCodeHeight(height: number): void {
  try {
    localStorage.setItem(CODE_HEIGHT_KEY, String(Math.round(height)));
  } catch {
    // 只是少了一次记忆。
  }
}

// ———————————————————————————— 表单小工具 ————————————————————————————

function panelBlock(title: string, id: string): HTMLElement {
  return el('section', { class: 'component-block', attrs: { 'data-block': id } }, [
    el('h3', { class: 'component-block__title', text: title }),
  ]);
}

function row(label: string, control: HTMLElement): HTMLElement {
  const wrapper = el('label', { class: 'component-row' }, [
    el('span', { class: 'component-row__label', text: label }),
  ]);
  wrapper.append(control);
  return wrapper;
}

function textInput(value: string, onInput: (value: string) => void): HTMLInputElement {
  const input = el('input', { class: 'field component-input', attrs: { type: 'text' } });
  input.value = value;
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

function numberInput(
  value: number,
  bounds: { readonly min?: number; readonly max?: number; readonly step?: number },
  onInput: (value: number) => void,
): HTMLInputElement {
  const input = el('input', {
    class: 'field component-input component-input--number',
    attrs: { type: 'number' },
  });
  if (bounds.min !== undefined) input.min = String(bounds.min);
  if (bounds.max !== undefined) input.max = String(bounds.max);
  if (bounds.step !== undefined) input.step = String(bounds.step);
  input.value = String(value);
  input.addEventListener('input', () => {
    const numeric = Number(input.value);
    if (input.value.trim() !== '' && Number.isFinite(numeric)) onInput(numeric);
  });
  return input;
}

function select(
  options: readonly { readonly value: string; readonly label: string }[],
  value: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const control = el(
    'select',
    { class: 'field component-input' },
    options.map((option) => {
      const item = el('option', { text: option.label, attrs: { value: option.value } });
      item.selected = option.value === value;
      return item;
    }),
  );
  control.addEventListener('change', () => onChange(control.value));
  return control;
}

function checkbox(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLElement {
  const box = el('input', { attrs: { type: 'checkbox' } });
  box.checked = checked;
  box.addEventListener('change', () => onChange(box.checked));
  return el('label', { class: 'component-check' }, [box, el('span', { text: label })]);
}

function segmented(
  label: string,
  options: readonly { readonly value: string; readonly label: string }[],
  value: string,
  onChange: (value: string) => void,
): HTMLElement {
  return el(
    'div',
    { class: 'component-segmented', attrs: { role: 'group', 'aria-label': label } },
    options.map((option) =>
      el('button', {
        class: 'component-segmented__item',
        text: option.label,
        attrs: { type: 'button', 'aria-pressed': String(option.value === value) },
        on: { click: () => onChange(option.value) },
      }),
    ),
  );
}

function iconButton(text: string, label: string, onClick: () => void): HTMLButtonElement {
  return el('button', {
    class: 'button component-icon-button',
    text,
    attrs: { type: 'button', 'aria-label': label, title: label },
    on: { click: onClick },
  });
}

/** 按控件类型编辑默认值（左栏定义表单与右栏检查器共用）。 */
function defaultEditor(
  field: Field,
  onChange: (value: string | number | boolean) => void,
): HTMLElement {
  switch (field.kind) {
    case 'number':
      return numberInput(
        typeof field.default === 'number' ? field.default : 0,
        {
          ...(field.min === undefined ? {} : { min: field.min }),
          ...(field.max === undefined ? {} : { max: field.max }),
          ...(field.step === undefined ? {} : { step: field.step }),
        },
        onChange,
      );
    case 'boolean': {
      const box = el('input', { attrs: { type: 'checkbox' } });
      box.checked = field.default === true;
      box.addEventListener('change', () => onChange(box.checked));
      return box;
    }
    case 'choice':
      return select(
        (field.options ?? []).map((option) => ({ value: option, label: option })),
        String(field.default),
        onChange,
      );
    case 'color': {
      const text = textInput(String(field.default), (value) => {
        if (/^#[0-9a-fA-F]{6}$/.test(value)) picker.value = value;
        onChange(value);
      });
      const picker = el('input', {
        class: 'component-color',
        attrs: { type: 'color', 'aria-label': `${field.label}取色` },
      });
      picker.value = /^#[0-9a-fA-F]{6}$/.test(String(field.default))
        ? String(field.default)
        : '#000000';
      picker.addEventListener('input', () => {
        text.value = picker.value;
        onChange(picker.value);
      });
      return el('span', { class: 'component-color-field' }, [picker, text]);
    }
    default:
      return textInput(String(field.default), onChange);
  }
}

// ———————————————————————————— 对话框 ————————————————————————————

function confirmDialog(options: {
  readonly title: string;
  readonly lines: readonly string[];
  readonly confirm: string;
  readonly danger?: boolean;
  readonly cancel?: boolean;
  readonly links?: readonly { readonly label: string; readonly run: () => void }[];
}): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = el('div', { class: 'ds-overlay', attrs: { 'data-component-dialog': '' } });
    const done = (value: boolean): void => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') done(false);
    };
    const confirmButton = el('button', {
      class: `button ${options.danger === true ? 'button--danger' : 'button--primary'}`,
      text: options.confirm,
      attrs: { type: 'button', 'data-component-dialog-confirm': '' },
      on: { click: () => done(true) },
    });
    overlay.append(
      el(
        'div',
        {
          class: 'ds-dialog',
          attrs: { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': options.title },
        },
        [
          el('h2', { class: 'ds-dialog__title', text: options.title }),
          el(
            'div',
            { class: 'ds-dialog__body' },
            options.lines.map((line) => el('p', { text: line })),
          ),
          ...(options.links === undefined || options.links.length === 0
            ? []
            : [
                el(
                  'ul',
                  { class: 'ds-ref-list' },
                  options.links.map((link) =>
                    el('li', { class: 'ds-ref-list__item' }, [
                      el('button', {
                        class: 'ds-ref-list__link',
                        text: link.label,
                        attrs: { type: 'button' },
                        on: {
                          click: () => {
                            done(false);
                            link.run();
                          },
                        },
                      }),
                    ]),
                  ),
                ),
              ]),
          el('div', { class: 'ds-dialog__actions' }, [
            ...(options.cancel === false
              ? []
              : [
                  el('button', {
                    class: 'button',
                    text: '取消',
                    attrs: { type: 'button' },
                    on: { click: () => done(false) },
                  }),
                ]),
            confirmButton,
          ]),
        ],
      ),
    );
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    confirmButton.focus();
  });
}
