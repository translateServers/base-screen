import { completeFromList } from '@codemirror/autocomplete';
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript';
import { syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { type Diagnostic, linter, lintGutter } from '@codemirror/lint';
import { EditorState, Prec } from '@codemirror/state';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';

/**
 * 组件编辑器的代码面板（ADR-0106 D2）：CodeMirror 6，只作为示例依赖。
 *
 * - 行号、括号匹配等来自 `basicSetup`；语法配色用 One Dark（`basicSetup` 自带的是浅色底配色，深色面板上关键字看不清）；
 * - 渲染上下文变量（root / props / value …）以 JavaScript 语言数据追加补全，不覆盖语言自带补全；
 * - 语法错误直接读 Lezer 语法树里的错误节点标红，不需要执行代码；
 * - `Mod-S` 立即保存草稿，`Mod-Enter` 立即刷新预览。
 * - `language: 'json'`：L2 模板物料的模板面板（ADR-0116）。沿用 JavaScript 的配色（JSON 是它的子集，
 *   不为此新增依赖），错误改用 `JSON.parse` 判定，不提供渲染上下文补全。
 */
export interface CodeEditorCompletion {
  readonly label: string;
  readonly detail: string;
}

export interface CodeEditorOptions {
  readonly value: string;
  readonly completions: readonly CodeEditorCompletion[];
  /** 缺省 `javascript`（渲染代码）；`json` 用于模板。 */
  readonly language?: 'javascript' | 'json';
  onChange(value: string): void;
  onSave?(): void;
  onRun?(): void;
}

export interface CodeEditorHandle {
  readonly element: HTMLElement;
  getValue(): string;
  /** 换一份源码（切换组件、放弃草稿）；不触发 onChange。 */
  setValue(value: string): void;
  focus(): void;
  /** 有语法错误的第一行（1 起算）；没有时为 undefined。 */
  firstErrorLine(): number | undefined;
  destroy(): void;
}

const theme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: '13px',
      backgroundColor: 'var(--color-surface-solid)',
      color: 'var(--color-text)',
    },
    '.cm-scroller': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      lineHeight: '1.55',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--color-surface-solid)',
      color: 'var(--color-text-muted)',
      borderRight: '1px solid var(--color-border)',
    },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgba(56, 189, 248, 0.06)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-tooltip': {
      border: '1px solid var(--color-border)',
      backgroundColor: 'var(--color-surface-solid)',
    },
  },
  { dark: true },
);

function syntaxDiagnostics(state: EditorState): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const length = state.doc.length;
  syntaxTree(state).iterate({
    enter(node) {
      if (!node.type.isError) return;
      const from = Math.min(node.from, Math.max(0, length - 1));
      const to = Math.min(Math.max(node.to, from + 1), length);
      diagnostics.push({ from, to, severity: 'error', message: '语法错误' });
    },
  });
  return diagnostics.slice(0, 20);
}

/** JSON 的错误位置：V8 的消息带 `position N`，其余引擎退回文首。 */
function jsonDiagnostics(state: EditorState): Diagnostic[] {
  const text = state.doc.toString();
  if (text.trim() === '') return [];
  try {
    JSON.parse(text);
    return [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const length = state.doc.length;
    const at = Number(/position (\d+)/.exec(message)?.[1] ?? 0);
    const from = Math.min(Math.max(0, at), Math.max(0, length - 1));
    return [{ from, to: Math.min(from + 1, length), severity: 'error', message: 'JSON 语法错误' }];
  }
}

export function createCodeEditor(options: CodeEditorOptions): CodeEditorHandle {
  const json = options.language === 'json';
  const diagnose = json ? jsonDiagnostics : syntaxDiagnostics;
  const element = document.createElement('div');
  element.className = 'component-code-editor';
  let silent = false;
  const view = new EditorView({
    parent: element,
    state: EditorState.create({
      doc: options.value,
      extensions: [
        basicSetup,
        javascript(),
        syntaxHighlighting(oneDarkHighlightStyle),
        ...(json
          ? []
          : [
              javascriptLanguage.data.of({
                autocomplete: completeFromList(
                  options.completions.map((item) => ({
                    label: item.label,
                    detail: item.detail,
                    type: 'variable',
                    boost: 10,
                  })),
                ),
              }),
            ]),
        linter((current) => diagnose(current.state), { delay: 300 }),
        lintGutter(),
        Prec.high(
          keymap.of([
            {
              key: 'Mod-s',
              preventDefault: true,
              run: () => {
                options.onSave?.();
                return true;
              },
            },
            {
              key: 'Mod-Enter',
              preventDefault: true,
              run: () => {
                options.onRun?.();
                return true;
              },
            },
          ]),
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !silent) options.onChange(update.state.doc.toString());
        }),
        theme,
      ],
    }),
  });
  return {
    element,
    getValue: () => view.state.doc.toString(),
    setValue(value) {
      if (value === view.state.doc.toString()) return;
      silent = true;
      try {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
      } finally {
        silent = false;
      }
    },
    focus: () => view.focus(),
    firstErrorLine() {
      const first = diagnose(view.state)[0];
      return first === undefined ? undefined : view.state.doc.lineAt(first.from).number;
    },
    destroy: () => view.destroy(),
  };
}
