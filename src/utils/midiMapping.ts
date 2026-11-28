import {
  MidiCurveType,
  MidiMappableParamKey,
  MidiMapping,
  MidiMessageType,
  MidiParameterSpec,
  MidiSignalEvent,
} from '../types/midi';
import { StudioSettings } from '../types/studio';

const MIDI_MAPPINGS_STORAGE_KEY = 'pulsewave_midi_mappings_v1';
const MIDI_ENABLED_STORAGE_KEY = 'pulsewave_midi_enabled_v1';

export const MIDI_MAPPABLE_PARAMS: MidiParameterSpec[] = [
  {
    key: 'sensitivity',
    label: 'Sensitivity / Gain',
    category: 'Audio & Visuals',
    min: 0.5,
    max: 2.5,
    step: 0.05,
    defaultValue: 1.2,
    formatValue: (v) => `${v.toFixed(2)}×`,
  },
  {
    key: 'bloomIntensity',
    label: 'Bloom Intensity',
    category: 'Audio & Visuals',
    min: 0,
    max: 1.5,
    step: 0.05,
    defaultValue: 0,
    formatValue: (v) => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`),
  },
  {
    key: 'glitchIntensity',
    label: 'Glitch Intensity',
    category: 'Audio & Visuals',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: 0,
    formatValue: (v) => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`),
  },
  {
    key: 'bassShake',
    label: 'Bass Shake',
    category: 'Audio & Visuals',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: 0,
    formatValue: (v) => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`),
  },
  {
    key: 'beatShake',
    label: 'Beat Shake',
    category: 'Audio & Visuals',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: 0,
    formatValue: (v) => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`),
  },
  {
    key: 'visualizerScale',
    label: 'Visualizer Scale',
    category: 'Audio & Visuals',
    min: 0.55,
    max: 1.5,
    step: 0.05,
    defaultValue: 1,
    formatValue: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: 'motionBlur',
    label: 'Motion Blur',
    category: 'Audio & Visuals',
    min: 0,
    max: 0.85,
    step: 0.05,
    defaultValue: 0,
    formatValue: (v) => (v === 0 ? 'Off' : `${Math.round((v / 0.85) * 100)}%`),
  },
  {
    key: 'smoothing',
    label: 'Spectrum Smoothing',
    category: 'Audio & Visuals',
    min: 0.1,
    max: 0.95,
    step: 0.05,
    defaultValue: 0.78,
    formatValue: (v) => v.toFixed(2),
  },
  {
    key: 'barCount',
    label: 'Bar Count',
    category: 'Audio & Visuals',
    min: 32,
    max: 160,
    step: 4,
    defaultValue: 72,
    formatValue: (v) => `${Math.round(v)}`,
  },
  {
    key: 'beatSensitivity',
    label: 'Beat Burst Sensitivity',
    category: 'Audio & Visuals',
    min: 0.8,
    max: 2.0,
    step: 0.05,
    defaultValue: 1.25,
    formatValue: (v) => `${v.toFixed(2)}×`,
  },
  {
    key: 'lyricPosition',
    label: 'Lyric Vertical Position',
    category: 'Lyrics & Overlay',
    min: 15,
    max: 92,
    step: 1,
    defaultValue: 80,
    formatValue: (v) => `${Math.round(v)}%`,
  },
  {
    key: 'bgBlur',
    label: 'Backdrop Blur',
    category: 'Backdrop',
    min: 0,
    max: 30,
    step: 1,
    defaultValue: 8,
    formatValue: (v) => `${Math.round(v)}px`,
  },
  {
    key: 'bgDim',
    label: 'Backdrop Dimness',
    category: 'Backdrop',
    min: 0,
    max: 0.9,
    step: 0.05,
    defaultValue: 0.45,
    formatValue: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: 'djFilterCutoff',
    label: 'DJ Low-Pass Filter Sweep',
    category: 'DJ Filter & FX',
    min: 0,
    max: 1,
    step: 0.02,
    defaultValue: 1,
    formatValue: (v) => {
      if (v >= 0.98) return 'Open (18 kHz)';
      const hz = Math.round(160 * Math.pow(112.5, Math.max(0, Math.min(1, v))));
      return hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${hz} Hz`;
    },
  },
  {
    key: 'djFilterResonance',
    label: 'DJ Filter Resonance (Q)',
    category: 'DJ Filter & FX',
    min: 0.7,
    max: 12,
    step: 0.1,
    defaultValue: 1.6,
    formatValue: (v) => `Q ${v.toFixed(1)}`,
  },
  {
    key: 'djAutoFilterDepth',
    label: 'DJ BPM Auto-Filter Sweep',
    category: 'DJ Filter & FX',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: 0,
    formatValue: (v) => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`),
  },
  {
    key: 'djDelayMix',
    label: 'DJ Beat-Synced Delay Mix',
    category: 'DJ Filter & FX',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: 0,
    formatValue: (v) => (v === 0 ? 'Dry' : `${Math.round(v * 100)}%`),
  },
  {
    key: 'djDelayFeedback',
    label: 'DJ Beat Delay Feedback',
    category: 'DJ Filter & FX',
    min: 0,
    max: 0.85,
    step: 0.05,
    defaultValue: 0.38,
    formatValue: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: 'djBeatGateDepth',
    label: 'DJ BPM Beat Gater',
    category: 'DJ Filter & FX',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: 0,
    formatValue: (v) => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`),
  },
  {
    key: 'djTransientAttack',
    label: 'DJ Transient Shaper Attack',
    category: 'DJ Filter & FX',
    min: -1,
    max: 1,
    step: 0.05,
    defaultValue: 0,
    formatValue: (v) => {
      const pct = Math.round(v * 100);
      if (pct === 0) return '0%';
      return pct > 0 ? `+${pct}%` : `${pct}%`;
    },
  },
  {
    key: 'djTransientSustain',
    label: 'DJ Transient Shaper Sustain',
    category: 'DJ Filter & FX',
    min: -1,
    max: 1,
    step: 0.05,
    defaultValue: 0,
    formatValue: (v) => {
      const pct = Math.round(v * 100);
      if (pct === 0) return '0%';
      return pct > 0 ? `+${pct}%` : `${pct}%`;
    },
  },
  {
    key: 'djTransientDither',
    label: 'DJ Transient Shaper Dither',
    category: 'DJ Filter & FX',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: 0,
    formatValue: (v) => (v < 0.01 ? 'Off' : `${Math.round(v * 100)}%`),
  },
  {
    key: 'djNoiseGateThreshold',
    label: 'DJ Filter Rack Noise Gate',
    category: 'DJ Filter & FX',
    min: -80,
    max: -18,
    step: 1,
    defaultValue: -80,
    formatValue: (v) => (v <= -79 ? 'Off' : `${Math.round(v)} dBFS`),
  },
];

const PARAM_MAP = new Map<MidiMappableParamKey, MidiParameterSpec>(
  MIDI_MAPPABLE_PARAMS.map((spec) => [spec.key, spec])
);

export function getMidiParamSpec(key: MidiMappableParamKey): MidiParameterSpec {
  return PARAM_MAP.get(key) ?? MIDI_MAPPABLE_PARAMS[0];
}

export function createMidiMappingId(): string {
  return `midi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function quantizeParamValue(value: number, spec: MidiParameterSpec): number {
  const clamped = Math.max(spec.min, Math.min(spec.max, value));
  const stepped = Math.round((clamped - spec.min) / spec.step) * spec.step + spec.min;
  const bounded = Math.max(spec.min, Math.min(spec.max, stepped));
  const decimals = spec.step >= 1 ? 0 : spec.step >= 0.1 ? 1 : 2;
  return Number(bounded.toFixed(decimals));
}

export function mapNormalizedToSettingValue(
  normalized: number,
  mapping: Pick<MidiMapping, 'minValue' | 'maxValue' | 'invert' | 'curve'>,
  spec: MidiParameterSpec
): number {
  const clampedNorm = Math.max(0, Math.min(1, normalized));
  const directed = mapping.invert ? 1 - clampedNorm : clampedNorm;
  const curved = mapping.curve === 'exponential' ? Math.pow(directed, 1.8) : directed;
  const rangeMin = Math.max(spec.min, Math.min(spec.max, mapping.minValue));
  const rangeMax = Math.max(spec.min, Math.min(spec.max, mapping.maxValue));
  const interpolated = rangeMin + (rangeMax - rangeMin) * curved;
  return quantizeParamValue(interpolated, spec);
}

export function parseMidiMessage(
  data: Uint8Array,
  deviceId: string,
  deviceName: string
): MidiSignalEvent | null {
  if (!data || data.length < 2) return null;

  const statusByte = data[0];
  if (statusByte >= 0xf0) {
    // Ignore System Common / Real-Time clock messages
    return null;
  }

  const command = statusByte & 0xf0;
  const channel = statusByte & 0x0f;
  const d1 = data[1] & 0x7f;
  const d2 = data.length > 2 ? data[2] & 0x7f : 0;

  if (command === 0xb0) {
    return {
      deviceId,
      deviceName,
      messageType: 'cc',
      channel,
      controller: d1,
      rawValue: d2,
      normalized: d2 / 127,
      timestamp: Date.now(),
    };
  }

  if (command === 0xe0) {
    const val14 = (d2 << 7) | d1;
    return {
      deviceId,
      deviceName,
      messageType: 'pitchbend',
      channel,
      controller: 0,
      rawValue: val14,
      normalized: val14 / 16383,
      timestamp: Date.now(),
    };
  }

  if (command === 0x90 && d2 > 0) {
    return {
      deviceId,
      deviceName,
      messageType: 'note',
      channel,
      controller: d1,
      rawValue: d2,
      normalized: d2 / 127,
      timestamp: Date.now(),
    };
  }

  return null;
}

export function doesSignalMatchMapping(
  signal: MidiSignalEvent,
  mapping: MidiMapping
): boolean {
  if (!mapping.enabled) return false;
  if (mapping.deviceId !== 'any' && mapping.deviceId !== signal.deviceId) {
    return false;
  }
  if (mapping.messageType !== signal.messageType) return false;
  if (mapping.channel !== -1 && mapping.channel !== signal.channel) return false;
  if (mapping.messageType === 'pitchbend') return true;
  return mapping.controller === signal.controller;
}

export function applyMidiSignalToMappings(
  signal: MidiSignalEvent,
  mappings: MidiMapping[]
): Partial<StudioSettings> | null {
  let patch: Partial<StudioSettings> | null = null;
  for (const mapping of mappings) {
    if (!doesSignalMatchMapping(signal, mapping)) continue;
    const spec = getMidiParamSpec(mapping.targetParam);
    const nextVal = mapNormalizedToSettingValue(signal.normalized, mapping, spec);
    if (!patch) patch = {};
    patch[mapping.targetParam] = nextVal;
  }
  return patch;
}

export function formatMidiSourceLabel(
  source: Pick<MidiMapping, 'messageType' | 'channel' | 'controller'>
): string {
  const ch = source.channel === -1 ? 'Omni' : `Ch ${source.channel + 1}`;
  if (source.messageType === 'pitchbend') {
    return `Pitch Bend · ${ch}`;
  }
  if (source.messageType === 'note') {
    return `Note ${source.controller} · ${ch}`;
  }
  return `CC ${source.controller} · ${ch}`;
}

export function formatMidiShortTag(
  source: Pick<MidiMapping, 'messageType' | 'controller'>
): string {
  if (source.messageType === 'pitchbend') return 'PB';
  if (source.messageType === 'note') return `N${source.controller}`;
  return `CC ${source.controller}`;
}

export function createMappingFromSignal(
  targetParam: MidiMappableParamKey,
  signal: MidiSignalEvent,
  existing?: MidiMapping
): MidiMapping {
  const spec = getMidiParamSpec(targetParam);
  return {
    id: existing?.id ?? createMidiMappingId(),
    targetParam,
    messageType: signal.messageType,
    channel: signal.channel,
    controller: signal.controller,
    deviceId: signal.deviceId,
    deviceName: signal.deviceName,
    minValue: existing?.minValue ?? spec.min,
    maxValue: existing?.maxValue ?? spec.max,
    invert: existing?.invert ?? false,
    curve: existing?.curve ?? 'linear',
    enabled: true,
  };
}

export function createStarterMidiMappings(): MidiMapping[] {
  const starterSpecs: Array<{
    key: MidiMappableParamKey;
    controller: number;
    curve: MidiCurveType;
  }> = [
    { key: 'sensitivity', controller: 1, curve: 'linear' },
    { key: 'bloomIntensity', controller: 2, curve: 'exponential' },
    { key: 'visualizerScale', controller: 3, curve: 'linear' },
    { key: 'motionBlur', controller: 4, curve: 'linear' },
  ];

  return starterSpecs.map((item) => {
    const spec = getMidiParamSpec(item.key);
    return {
      id: createMidiMappingId(),
      targetParam: item.key,
      messageType: 'cc',
      channel: -1,
      controller: item.controller,
      deviceId: 'any',
      deviceName: 'Any Controller',
      minValue: spec.min,
      maxValue: spec.max,
      invert: false,
      curve: item.curve,
      enabled: true,
    };
  });
}

function isValidMessageType(val: unknown): val is MidiMessageType {
  return val === 'cc' || val === 'pitchbend' || val === 'note';
}

export function loadMidiMappings(): MidiMapping[] {
  try {
    const raw = localStorage.getItem(MIDI_MAPPINGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item): MidiMapping | null => {
        const key = item.targetParam as MidiMappableParamKey;
        if (!PARAM_MAP.has(key)) return null;
        const spec = getMidiParamSpec(key);
        const msgType = isValidMessageType(item.messageType) ? item.messageType : 'cc';
        const channel =
          typeof item.channel === 'number' &&
          Number.isInteger(item.channel) &&
          item.channel >= -1 &&
          item.channel <= 15
            ? item.channel
            : -1;
        const controller =
          typeof item.controller === 'number' &&
          Number.isInteger(item.controller) &&
          item.controller >= 0 &&
          item.controller <= 127
            ? item.controller
            : 1;
        const minValue =
          typeof item.minValue === 'number' && Number.isFinite(item.minValue)
            ? quantizeParamValue(item.minValue, spec)
            : spec.min;
        const maxValue =
          typeof item.maxValue === 'number' && Number.isFinite(item.maxValue)
            ? quantizeParamValue(item.maxValue, spec)
            : spec.max;
        return {
          id: typeof item.id === 'string' && item.id ? item.id : createMidiMappingId(),
          targetParam: key,
          messageType: msgType,
          channel,
          controller: msgType === 'pitchbend' ? 0 : controller,
          deviceId: typeof item.deviceId === 'string' && item.deviceId ? item.deviceId : 'any',
          deviceName: typeof item.deviceName === 'string' ? item.deviceName : undefined,
          minValue,
          maxValue,
          invert: Boolean(item.invert),
          curve: item.curve === 'exponential' ? 'exponential' : 'linear',
          enabled: item.enabled !== false,
        };
      })
      .filter((item): item is MidiMapping => item !== null);
  } catch {
    return [];
  }
}

export function persistMidiMappings(mappings: MidiMapping[]): void {
  try {
    localStorage.setItem(MIDI_MAPPINGS_STORAGE_KEY, JSON.stringify(mappings));
  } catch {
    // Ignore storage quota / privacy mode failures
  }
}

export function loadMidiEnabled(): boolean {
  try {
    const raw = localStorage.getItem(MIDI_ENABLED_STORAGE_KEY);
    if (raw === null) return true;
    return raw !== 'false';
  } catch {
    return true;
  }
}

export function persistMidiEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(MIDI_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage errors
  }
}
