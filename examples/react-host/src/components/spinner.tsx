import type React from 'react';

/** 骨架屏占位：尺寸固定，避免加载态与就绪态之间的布局跳动。 */
export function SkeletonGrid({ count = 3 }: { readonly count?: number }): React.ReactElement {
  return (
    <div className="screen-grid">
      {Array.from({ length: count }, (_, index) => (
        <article key={index} className="screen-card screen-card--skeleton" aria-hidden="true" />
      ))}
    </div>
  );
}
