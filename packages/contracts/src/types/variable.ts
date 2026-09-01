export interface ScreenHostVariableSummary {
  readonly variableId: string;
  readonly name: string;
  readonly description: string | null;
}

export interface ScreenHostVariableDescriptor extends ScreenHostVariableSummary {
  readonly previewable: boolean;
}

export interface ScreenHostVariablePage {
  readonly items: readonly ScreenHostVariableSummary[];
  readonly nextCursor?: string;
}

export interface ScreenVariableRefreshOptions {
  /** Omission refreshes every host variable referenced by the current document. */
  readonly variableIds?: readonly string[];
  readonly traceId?: string;
}
