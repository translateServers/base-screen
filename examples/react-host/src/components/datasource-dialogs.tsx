import type { DatasourceRefScreen } from '../lib/datasource-model';
import { DATASOURCE_TEXT, screenEditHref } from '../lib/datasource-model';
import { formatDateTime } from '../lib/format';

/**
 * 数据源页的三个弹层（PRD §9.4 / §9.5 / R5）。
 *
 * **一律用页面内弹层，不用 `window.confirm`**：嵌入式浏览器会静默返回 `null`，用户看到的是
 * 「点了没反应」。三个弹层都带 `data-ds-dialog` 供冒烟定位，主按钮带 `data-ds-confirm`。
 */

export function ConfirmDeleteDialog({
  name,
  onCancel,
  onConfirm,
}: {
  readonly name: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}): React.ReactElement {
  return (
    <Overlay kind="confirm-delete" label="确认删除">
      <h2 className="ds-dialog__title">删除「{name}」？</h2>
      <p className="ds-dialog__body">删除后不可撤销，引用它的大屏会显示「数据源不可用」。</p>
      <footer className="ds-dialog__actions">
        <button type="button" className="button" onClick={onCancel}>
          {DATASOURCE_TEXT.cancel}
        </button>
        <button
          type="button"
          className="button button--danger"
          data-ds-confirm="delete"
          onClick={onConfirm}
        >
          {DATASOURCE_TEXT.remove}
        </button>
      </footer>
    </Overlay>
  );
}

export function DeleteBlockedDialog({
  name,
  refScreens,
  onClose,
}: {
  readonly name: string;
  readonly refScreens: readonly DatasourceRefScreen[];
  readonly onClose: () => void;
}): React.ReactElement {
  return (
    <Overlay kind="delete-blocked" label={DATASOURCE_TEXT.deleteBlockedTitle}>
      <h2 className="ds-dialog__title">无法删除：「{name}」</h2>
      <p className="ds-dialog__body">
        仍有 {refScreens.length} 张大屏在使用它。{DATASOURCE_TEXT.refHint}
      </p>
      <ul className="ds-ref-list" data-ds-ref-list="">
        {refScreens.map((screen) => (
          <li key={screen.id} className="ds-ref-list__item">
            <span className="ds-ref-list__name">{screen.name}</span>
            {screen.updatedAt === '' ? null : (
              <span className="ds-ref-list__time">{formatDateTime(screen.updatedAt)}</span>
            )}
            <a className="button ds-ref-list__link" href={screenEditHref(screen.id)}>
              {DATASOURCE_TEXT.goUnbind}
            </a>
          </li>
        ))}
      </ul>
      <footer className="ds-dialog__actions">
        <button
          type="button"
          className="button button--primary"
          data-ds-confirm="ok"
          onClick={onClose}
        >
          {DATASOURCE_TEXT.known}
        </button>
      </footer>
    </Overlay>
  );
}

export function DiscardDialog({
  onCancel,
  onConfirm,
}: {
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}): React.ReactElement {
  return (
    <Overlay kind="discard" label={DATASOURCE_TEXT.discardTitle}>
      <h2 className="ds-dialog__title">{DATASOURCE_TEXT.discardTitle}</h2>
      <p className="ds-dialog__body">{DATASOURCE_TEXT.discardBody}</p>
      <footer className="ds-dialog__actions">
        <button type="button" className="button" onClick={onCancel}>
          {DATASOURCE_TEXT.keepEditing}
        </button>
        <button
          type="button"
          className="button button--danger"
          data-ds-confirm="discard"
          onClick={onConfirm}
        >
          {DATASOURCE_TEXT.discardConfirm}
        </button>
      </footer>
    </Overlay>
  );
}

function Overlay({
  kind,
  label,
  children,
}: {
  readonly kind: string;
  readonly label: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="ds-overlay">
      <div
        className="ds-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-ds-dialog={kind}
      >
        {children}
      </div>
    </div>
  );
}
