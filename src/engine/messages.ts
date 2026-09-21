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
  | 'endHigh'
  | 'backHypoxicAtSurface'
  | 'decoSwitchNotShallower'
  | 'duplicateSwitchDepth'
  | 'gasShort'
  | 'missingGas'
  | 'penNoTeam'
  | 'penDepthLimit'
  | 'penMinStartGas'
  | 'penSharedExitShort'
  | 'penSiphon'
  | 'penDissimilar'
  | 'penStageRuleDiffers'
  | 'penDecoNoGas'
  | 'penTimeOverGas'
  | 'penOverrideActive'
  | 'penUnsupportedDepth'
  | 'smLostCylinderMinGas'
  | 'smLostCylinderExit'
  | 'recOverNdl'
  | 'recDepthLimit'
  | 'recGasShort';

export interface Msg {
  code: MsgCode;
  params: Record<string, string | number>;
}

export const msg = (code: MsgCode, params: Record<string, string | number> = {}): Msg => ({ code, params });
