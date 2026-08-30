const NUMBER = (minimum?: number, maximum?: number) => ({
  kind: 'number' as const,
  ...(minimum === undefined ? {} : { minimum }),
  ...(maximum === undefined ? {} : { maximum }),
});
const STRING = (maxLength?: number) =>
  maxLength === undefined ? { kind: 'string' as const } : { kind: 'string' as const, maxLength };
const BOOLEAN = { kind: 'boolean' as const };
const ENUM = (values: readonly (string | number | boolean)[]) => ({
  kind: 'enum' as const,
  values,
});

export const BASE_SCREEN_ECHARTS_PROPS_SCHEMA = {
  kind: 'object' as const,
  properties: {
    title: {
      kind: 'object' as const,
      properties: {
        show: BOOLEAN,
        text: STRING(128),
        color: STRING(),
        fontSize: NUMBER(8, 64),
      },
      required: [],
    },
    legend: {
      kind: 'object' as const,
      properties: {
        show: BOOLEAN,
        position: ENUM(['top', 'bottom', 'left', 'right']),
        fontSize: NUMBER(8, 32),
      },
      required: [],
    },
    grid: {
      kind: 'object' as const,
      properties: {
        show: BOOLEAN,
        top: NUMBER(0, 200),
        right: NUMBER(0, 200),
        bottom: NUMBER(0, 200),
        left: NUMBER(0, 200),
      },
      required: [],
    },
    xAxis: {
      kind: 'object' as const,
      properties: {
        show: BOOLEAN,
        name: STRING(64),
        color: STRING(),
        fontSize: NUMBER(8, 32),
      },
      required: [],
    },
    yAxis: {
      kind: 'object' as const,
      properties: { show: BOOLEAN, name: STRING(64), color: STRING() },
      required: [],
    },
    yAxis2: {
      kind: 'object' as const,
      properties: { show: BOOLEAN, name: STRING(64), color: STRING() },
      required: [],
    },
    series: {
      kind: 'array' as const,
      items: {
        kind: 'object' as const,
        properties: {
          name: STRING(128),
          type: ENUM(['line', 'bar', 'area']),
          xField: STRING(256),
          yField: STRING(256),
          yAxisIndex: ENUM([0, 1]),
          color: STRING(),
          lineWidth: NUMBER(1, 8),
        },
        required: [],
      },
      minItems: 0,
      maxItems: 16,
    },
    tooltip: {
      kind: 'object' as const,
      properties: { show: BOOLEAN, trigger: ENUM(['axis', 'item']) },
      required: [],
    },
    interactions: {
      kind: 'object' as const,
      properties: {
        hover: BOOLEAN,
        select: BOOLEAN,
        click: ENUM(['none', 'host-event']),
      },
      required: [],
    },
    advanced: {
      kind: 'object' as const,
      properties: {
        showDataLabels: BOOLEAN,
        axisLabelRotate: NUMBER(0, 90),
        symbolSize: NUMBER(2, 12),
        areaOpacity: NUMBER(0, 1),
      },
      required: [],
    },
  },
  required: [],
};
