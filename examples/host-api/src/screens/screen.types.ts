/** 大屏文档的对外投影：document 为 canonical Screen Document JSON（宿主只存取，不理解内部结构）。 */
export interface ScreenShape {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly document: unknown;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 列表项投影：不携带 document，避免列表响应膨胀。 */
export interface ScreenSummaryShape {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly updatedAt: string;
}
