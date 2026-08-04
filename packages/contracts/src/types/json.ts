export type ScreenJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly ScreenJsonValue[]
  | { readonly [key: string]: ScreenJsonValue };

export type ScreenJsonObject = Readonly<Record<string, ScreenJsonValue>>;
