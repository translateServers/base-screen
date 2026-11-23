export const MAX_CANONICAL_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ENVELOPE_BYTES = 10 * 1024 * 1024;
export const MAX_COMPONENTS = 10_000;
/** 从画布上限与命名长度（ADR-0109）。 */
export const MAX_SUB_CANVASES = 64;
export const MAX_SUB_CANVAS_NAME_CODE_POINTS = 64;
/** 弹框面板圆角上限。 */
export const MAX_POPUP_BORDER_RADIUS = 200;
/** 弹框偏移的绝对值上限（同画布尺寸上限）。 */
export const MAX_POPUP_OFFSET = 100_000;
export const MAX_VARIABLES = 1_000;
/** 蓝图节点图上限（ADR-0107 D4）。 */
export const MAX_BLUEPRINT_NODES = 2_000;
export const MAX_BLUEPRINT_EDGES = 10_000;
/** 单条执行路径上串联的条件节点数上限。 */
export const MAX_BLUEPRINT_CONDITION_DEPTH = 16;
/** 派生规则（每个启用的触发锚点一条）总数上限。 */
export const MAX_BLUEPRINT_RULES = 1_000;
/** 单条派生规则深度优先展开后的步骤上限；条件扇出造成的路径组合爆炸在此截住。 */
export const MAX_BLUEPRINT_RULE_STEPS = 1_024;
/** 节点 / 定时器的可读名称长度上限。 */
export const MAX_BLUEPRINT_NODE_NAME_CODE_POINTS = 64;
export const MAX_BLUEPRINT_LAYOUT_NODES = 20_000;
export const MAX_BLUEPRINT_EXPRESSION_DEPTH = 16;
export const MAX_BLUEPRINT_EXPRESSION_CONTAINERS = 256;
export const MAX_BLUEPRINT_EXPRESSION_BYTES = 256 * 1024;
export const MAX_DATA_SOURCE_VALUE_BYTES = 1024 * 1024;
export const MAX_DATA_SOURCES = 1_000;
export const MAX_DATA_SOURCE_PARAMS = 64;
export const MAX_DATA_SOURCE_NAME_CODE_POINTS = 256;
export const MAX_VALUE_REF_PATH_SEGMENTS = 8;
export const MIN_DATA_SOURCE_UPDATE_INTERVAL_SECONDS = 1;
export const MAX_DATA_SOURCE_UPDATE_INTERVAL_SECONDS = 86_400;
/** `push` 实例的保留窗口（ADR-0104 §2.5）：行数上限、缺省行数与时长上限。 */
export const MIN_PUSH_RETAIN_ROWS = 1;
export const MAX_PUSH_RETAIN_ROWS = 10_000;
export const DEFAULT_PUSH_RETAIN_ROWS = 1_000;
export const MIN_PUSH_RETAIN_SECONDS = 1;
export const MAX_PUSH_RETAIN_SECONDS = 604_800;
/** `retain.timeField` 是数据集字段 id，长度与数据源参数名一致。 */
export const MAX_PUSH_RETAIN_TIME_FIELD_CODE_UNITS = 128;
/** 宿主能力声明 `delivery.push.inactivityTimeoutSeconds` 的范围。 */
export const MIN_PUSH_INACTIVITY_TIMEOUT_SECONDS = 1;
export const MAX_PUSH_INACTIVITY_TIMEOUT_SECONDS = 3_600;
export const MAX_NAME_CODE_POINTS = 256;
export const MAX_DESCRIPTION_CODE_POINTS = 4_096;
export const MAX_BACKGROUND_COLOR_CODE_POINTS = 128;
export const MAX_BACKGROUND_GRADIENT_STOPS = 8;
export const MAX_BACKGROUND_IMAGE_CODE_POINTS = 2048;
export const MAX_PROJECT_ID_BYTES = 256;
export const MAX_REVISION_BYTES = 512;
export const MAX_STYLE_RULES_PER_COMPONENT = 8;
export const MAX_STYLE_RULE_ID_CODE_POINTS = 64;
export const MAX_STYLE_RULE_PATH_SEGMENTS = 8;
export const MAX_STYLE_RULE_PATH_SEGMENT_CODE_POINTS = 64;
export const MAX_STYLE_RULE_VALUE_BYTES = 64 * 1024;
