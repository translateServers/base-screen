import type React from 'react';

/** 统一错误横幅：message + 重试；几何稳定（固定内边距），不引入布局抖动。 */
export function ErrorBanner({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
}): React.ReactElement {
  return (
    <div className="error-banner" role="alert">
      <span className="error-banner__message">{message}</span>
      {onRetry === undefined ? null : (
        <button type="button" className="button" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}
