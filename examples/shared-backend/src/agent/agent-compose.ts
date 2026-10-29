import type { AgentPanel, AgentScreenSpec } from './agent-spec';

const WIDTH = 1920;
const HEIGHT = 1080;
const MARGIN = 64;
const GAP = 24;

interface ComposeResult {
  readonly document: Record<string, unknown>;
  readonly imageCount: number;
}

interface Component {
  id: string;
  type: string;
  name: string;
  parentId: null;
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
  zIndex: number;
  status: { locked: boolean; hidden: boolean };
  props: Record<string, unknown>;
  style: Record<string, unknown>;
  dataSource: Record<string, unknown> | null;
}

/**
 * 把中间表示确定性编译成 canonical Screen Document。
 *
 * 模型不写组件树：位置、层级、样式都在这里算，越界会被夹回画布；
 * 图片面板统一走 `base.image` 的静态数据源，取不到图时退化为同色底板。
 */
export function composeScreenDocument(spec: AgentScreenSpec): ComposeResult {
  const components: Component[] = [];
  let z = 1;
  let imageCount = 0;

  const push = (component: Omit<Component, 'zIndex' | 'rotation' | 'status' | 'parentId'>): void => {
    components.push({
      ...component,
      parentId: null,
      rotation: 0,
      zIndex: z++,
      status: { locked: false, hidden: false },
    });
  };

  const text = (
    id: string,
    name: string,
    value: string,
    box: { x: number; y: number; width: number; height: number },
    style: Record<string, unknown>,
  ): void => {
    push({
      id,
      type: 'base.text',
      name,
      position: { x: box.x, y: box.y },
      size: { width: box.width, height: box.height },
      props: {},
      style: {
        color: '#e9eef5',
        fontSize: 20,
        fontWeight: '400',
        textAlign: 'left',
        verticalAlign: 'top',
        letterSpacing: 0,
        lineSpacing: 0,
        opacity: 1,
        flipX: false,
        flipY: false,
        ...style,
      },
      dataSource: { type: 'static', value },
    });
  };

  const rect = (
    id: string,
    name: string,
    box: { x: number; y: number; width: number; height: number },
    style: Record<string, unknown>,
  ): void => {
    push({
      id,
      type: 'base.rectangle',
      name,
      position: { x: box.x, y: box.y },
      size: { width: box.width, height: box.height },
      props: {},
      style: {
        fill: '#141b24',
        borderColor: '#243244',
        borderWidth: 0,
        opacity: 1,
        flipX: false,
        flipY: false,
        borderRadius: 12,
        shadowColor: '',
        shadowBlur: 0,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        ...style,
      },
      dataSource: null,
    });
  };

  // 背景
  rect('agent-bg', '背景', { x: 0, y: 0, width: WIDTH, height: HEIGHT }, {
    fill: '#0b1020',
    borderRadius: 0,
  });

  // 标题
  text('agent-title', '标题', spec.title, { x: MARGIN, y: 44, width: 1200, height: 62 }, {
    fontSize: 46,
    fontWeight: '600',
  });
  text('agent-subtitle', '副标题', spec.subtitle, { x: MARGIN, y: 112, width: 1400, height: 30 }, {
    fontSize: 20,
    color: '#93a0b0',
  });

  // KPI 带
  const kpis = spec.kpis.slice(0, 5);
  const kpiWidth = Math.floor((WIDTH - MARGIN * 2 - GAP * (kpis.length - 1)) / Math.max(1, kpis.length));
  kpis.forEach((kpi, index) => {
    const x = MARGIN + index * (kpiWidth + GAP);
    const y = 172;
    rect(`agent-kpi-${index}-bg`, '指标卡', { x, y, width: kpiWidth, height: 148 }, {});
    text(`agent-kpi-${index}-label`, '指标名', kpi.label, { x: x + 20, y: y + 18, width: kpiWidth - 40, height: 26 }, {
      fontSize: 18,
      color: '#93a0b0',
    });
    text(`agent-kpi-${index}-value`, '指标值', kpi.value, { x: x + 20, y: y + 50, width: kpiWidth - 40, height: 54 }, {
      fontSize: 42,
      fontWeight: '600',
    });
    if (kpi.delta !== undefined && kpi.delta !== '') {
      text(`agent-kpi-${index}-delta`, '同比', kpi.delta, { x: x + 20, y: y + 108, width: kpiWidth - 40, height: 24 }, {
        fontSize: 16,
        color: '#4fcb6f',
      });
    }
  });

  // 主区面板
  const panels = spec.panels.slice(0, 4);
  const panelWidth = Math.floor(
    (WIDTH - MARGIN * 2 - GAP * (panels.length - 1)) / Math.max(1, panels.length),
  );
  panels.forEach((panel, index) => {
    const x = MARGIN + index * (panelWidth + GAP);
    const y = 352;
    const height = 556;
    rect(`agent-panel-${index}-bg`, '面板底板', { x, y, width: panelWidth, height }, { fill: '#10161e' });
    text(`agent-panel-${index}-title`, '面板标题', panel.title, { x: x + 20, y: y + 16, width: panelWidth - 40, height: 28 }, {
      fontSize: 21,
      fontWeight: '600',
    });
    if (panel.note !== undefined && panel.note !== '') {
      text(`agent-panel-${index}-note`, '面板说明', panel.note, { x: x + 20, y: y + 48, width: panelWidth - 40, height: 22 }, {
        fontSize: 14,
        color: '#94a3b8',
      });
    }
    const bodyY = y + 84;
    const bodyHeight = height - 104;
    if (panel.kind === 'image') {
      const url = imageUrlFor(panel);
      push({
        id: `agent-panel-${index}-image`,
        type: 'base.image',
        name: '配图',
        position: { x: x + 20, y: bodyY },
        size: { width: panelWidth - 40, height: bodyHeight },
        props: {},
        style: { objectFit: 'cover', opacity: 1, flipX: false, flipY: false },
        dataSource: { type: 'static', value: url },
      });
      imageCount += 1;
      return;
    }
    if (panel.kind === 'chart') {
      const bars = 7;
      const chartWidth = panelWidth - 40;
      const barGap = 14;
      const barWidth = Math.floor((chartWidth - barGap * (bars - 1)) / bars);
      for (let bar = 0; bar < bars; bar += 1) {
        const ratio = [0.42, 0.58, 0.5, 0.74, 0.66, 0.86, 0.78][bar % 7] ?? 0.6;
        const barHeight = Math.floor(bodyHeight * ratio);
        rect(
          `agent-panel-${index}-bar-${bar}`,
          '柱',
          {
            x: x + 20 + bar * (barWidth + barGap),
            y: bodyY + bodyHeight - barHeight,
            width: barWidth,
            height: barHeight,
          },
          { fill: bar % 2 === 0 ? '#4c9df3' : '#2f6fb5', borderRadius: 4 },
        );
      }
      return;
    }
    const lines = ['一线渠道库存 6.2 万吨', '二线渠道库存 4.8 万吨', '三线渠道库存 2.1 万吨', '待补货门店 12 家'];
    lines.forEach((line, lineIndex) => {
      text(
        `agent-panel-${index}-line-${lineIndex}`,
        '列表项',
        line,
        { x: x + 20, y: bodyY + lineIndex * 46, width: panelWidth - 40, height: 30 },
        { fontSize: 18, color: '#c7d2e0' },
      );
    });
  });

  // 页脚
  text('agent-footer', '页脚', '生成自示例智能体 · 布局由宿主编译，未写入设计器历史', {
    x: MARGIN,
    y: 944,
    width: 1500,
    height: 26,
  }, { fontSize: 14, color: '#8a97a8' });

  return {
    document: {
      canvas: { width: WIDTH, height: HEIGHT, backgroundColor: '#0b1020' },
      components,
      variables: [],
      blueprint: { relations: [] },
    },
    imageCount,
  };
}

function imageUrlFor(panel: AgentPanel): string {
  if (panel.imageUrl !== undefined && panel.imageUrl.startsWith('https://')) return panel.imageUrl;
  const seed = encodeURIComponent(panel.title.trim().slice(0, 24) || 'screen');
  return `https://picsum.photos/seed/${seed}/960/640`;
}
