export interface ScreenHostVariableSummary {
  readonly sourceId: string;
  readonly sourceType: 'data-source' | 'url-query';
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
  /** Omission refreshes every dynamic variable in the current document. */
  readonly variableIds?: readonly string[];
  readonly traceId?: string;
}

export interface ScreenVariableHandle {
  readonly id: string;
  readonly value: import('./json.js').ScreenJsonValue;
  set(
    value: import('./json.js').ScreenJsonValue,
  ): import('./diagnostics.js').ScreenParseResult<null>;
  onChange(listener: (value: import('./json.js').ScreenJsonValue) => void): () => void;
}
