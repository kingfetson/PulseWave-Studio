export type MidiMappableParamKey =
  | 'sensitivity'
  | 'bloomIntensity'
  | 'glitchIntensity'
  | 'bassShake'
  | 'beatShake'
  | 'visualizerScale'
  | 'motionBlur'
  | 'smoothing'
  | 'barCount'
  | 'beatSensitivity'
  | 'lyricPosition'
  | 'bgBlur'
  | 'bgDim'
  | 'djFilterCutoff'
  | 'djFilterResonance'
  | 'djAutoFilterDepth'
  | 'djDelayMix'
  | 'djDelayFeedback'
  | 'djBeatGateDepth'
  | 'djTransientAttack'
  | 'djTransientSustain'
  | 'djTransientDither'
  | 'djNoiseGateThreshold';

export type MidiMessageType = 'cc' | 'pitchbend' | 'note';

export type MidiCurveType = 'linear' | 'exponential';

export type MidiConnectionStatus =
  | 'idle'
  | 'unsupported'
  | 'requesting'
  | 'connected'
  | 'denied'
  | 'error';

export interface MidiParameterSpec {
  key: MidiMappableParamKey;
  label: string;
  category: 'Audio & Visuals' | 'Lyrics & Overlay' | 'Backdrop' | 'DJ Filter & FX';
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  formatValue: (value: number) => string;
}

export interface MidiMapping {
  id: string;
  targetParam: MidiMappableParamKey;
  messageType: MidiMessageType;
  channel: number; // -1 for Any (Omni), or 0..15
  controller: number; // 0..127 for CC/Note, 0 for Pitch Bend
  deviceId: string; // 'any' or specific MIDIInput id
  deviceName?: string;
  minValue: number;
  maxValue: number;
  invert: boolean;
  curve: MidiCurveType;
  enabled: boolean;
}

export interface MidiDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: 'connected' | 'disconnected';
}

export interface MidiSignalEvent {
  deviceId: string;
  deviceName: string;
  messageType: MidiMessageType;
  channel: number; // 0..15
  controller: number; // 0..127
  rawValue: number; // 0..127 or 0..16383
  normalized: number; // 0..1
  timestamp: number;
}
