/** Language-independent messages emitted by the engine; the UI translates them. */
export type MsgCode =
  | 'bottomTimeShorterThanDescent'
  | 'stopTooLong'
  | 'ppo2AboveMax'
  | 'ppo2AboveWorking'
  | 'hypoxicBottomGas'
  | 'decoSwitchExceedsMod'
  | 'noBackGas'
  | 'multipleBackGas'
  | 'backEndAboveLimit'
  | 'backHypoxicAtSurface'
  | 'decoSwitchNotShallower'
  | 'duplicateSwitchDepth'
  | 'gasShort'
  | 'missingGas';

export interface Msg {
  code: MsgCode;
  params: Record<string, string | number>;
}

export const msg = (code: MsgCode, params: Record<string, string | number> = {}): Msg => ({ code, params });
