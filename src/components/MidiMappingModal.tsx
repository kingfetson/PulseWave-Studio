import { useEffect, useState } from 'react';
import {
  Cable,
  Check,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Sliders,
  Trash2,
  X,
} from 'lucide-react';
import {
  MidiConnectionStatus,
  MidiDeviceInfo,
  MidiMappableParamKey,
  MidiMapping,
  MidiMessageType,
  MidiParameterSpec,
  MidiSignalEvent,
} from '../types/midi';
import { StudioSettings } from '../types/studio';
import {
  createMidiMappingId,
  formatMidiSourceLabel,
  getMidiParamSpec,
  MIDI_MAPPABLE_PARAMS,
  quantizeParamValue,
} from '../utils/midiMapping';

interface MidiMappingModalProps {
  isOpen: boolean;
  status: MidiConnectionStatus;
  errorMessage: string | null;
  devices: MidiDeviceInfo[];
  lastSignal: MidiSignalEvent | null;
  midiEnabled: boolean;
  mappings: MidiMapping[];
  learningParam: MidiMappableParamKey | null;
  settings: StudioSettings;
  notice: string | null;
  onClose: () => void;
  onConnectMidi: () => void;
  onToggleMidiEnabled: (enabled: boolean) => void;
  onSetLearningParam: (param: MidiMappableParamKey | null) => void;
  onUpdateMapping: (id: string, patch: Partial<MidiMapping>) => void;
  onAddManualMapping: (mapping: MidiMapping) => void;
  onRemoveMapping: (id: string) => void;
  onLoadStarterMappings: () => void;
  onClearAllMappings: () => void;
  initialCategoryFilter?: CategoryFilter;
}

type CategoryFilter = 'all' | MidiParameterSpec['category'];

export function MidiMappingModal({
  isOpen,
  status,
  errorMessage,
  devices,
  lastSignal,
  midiEnabled,
  mappings,
  learningParam,
  settings,
  notice,
  onClose,
  onConnectMidi,
  onToggleMidiEnabled,
  onSetLearningParam,
  onUpdateMapping,
  onAddManualMapping,
  onRemoveMapping,
  onLoadStarterMappings,
  onClearAllMappings,
  initialCategoryFilter = 'all',
}: MidiMappingModalProps) {
  const [expandedParam, setExpandedParam] = useState<MidiMappableParamKey | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(initialCategoryFilter);

  useEffect(() => {
    if (isOpen) {
      setCategoryFilter(initialCategoryFilter);
    }
  }, [initialCategoryFilter, isOpen]);

  useEffect(() => {
    if (!isOpen && learningParam) {
      onSetLearningParam(null);
    }
  }, [isOpen, learningParam, onSetLearningParam]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (learningParam) {
          onSetLearningParam(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, learningParam, onClose, onSetLearningParam]);

  if (!isOpen) return null;

  const connectedDevices = devices.filter((d) => d.state === 'connected');
  const activeMappingsCount = mappings.filter((m) => m.enabled).length;

  const visibleParams =
    categoryFilter === 'all'
      ? MIDI_MAPPABLE_PARAMS
      : MIDI_MAPPABLE_PARAMS.filter((p) => p.category === categoryFilter);

  const mappedKeys = new Set(mappings.map((m) => m.targetParam));
  const unmappedVisibleParams = visibleParams.filter((p) => !mappedKeys.has(p.key));
  const learningSpec = learningParam ? getMidiParamSpec(learningParam) : null;
  const learningExistingMapping = learningParam
    ? mappings.find((m) => m.targetParam === learningParam) ?? null
    : null;
  const nextUnmappedParam =
    unmappedVisibleParams.find((p) => p.key !== learningParam) ??
    MIDI_MAPPABLE_PARAMS.find((p) => !mappedKeys.has(p.key) && p.key !== learningParam) ??
    null;

  const handleAssignManual = (spec: MidiParameterSpec, indexHint: number) => {
    const usedCcs = new Set(
      mappings.filter((m) => m.messageType === 'cc').map((m) => m.controller)
    );
    let cc = Math.min(127, Math.max(1, indexHint + 1));
    while (usedCcs.has(cc) && cc < 127) {
      cc += 1;
    }

    const created: MidiMapping = {
      id: createMidiMappingId(),
      targetParam: spec.key,
      messageType: 'cc',
      channel: -1,
      controller: cc,
      deviceId: 'any',
      deviceName: 'Any Controller',
      minValue: spec.min,
      maxValue: spec.max,
      invert: false,
      curve: 'linear',
      enabled: true,
    };
    onAddManualMapping(created);
    setExpandedParam(spec.key);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="midi-modal-title"
    >
      <div className="relative w-full max-w-4xl rounded-xl bg-[#121620] border border-white/[0.1] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-400/30 text-cyan-400 flex items-center justify-center shrink-0">
              <Cable className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id="midi-modal-title" className="text-sm font-semibold text-slate-100">
                MIDI Controller Mapping
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                Bind physical MIDI faders, knobs, and pitch wheels to visualizer controls for live performance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              role="switch"
              aria-checked={midiEnabled}
              onClick={() => onToggleMidiEnabled(!midiEnabled)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                midiEnabled
                  ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-300'
                  : 'bg-[#090b10] border-white/[0.08] text-slate-400 hover:text-slate-200'
              }`}
            >
              {midiEnabled ? 'MIDI Input Active' : 'MIDI Bypassed'}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close MIDI mapping dialog"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hardware Connection & Signal Telemetry Bar */}
        <div className="px-5 py-3 border-b border-white/[0.07] bg-[#0d1118] space-y-2.5 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs min-w-0">
              <span
                className={`font-medium ${
                  status === 'connected' && connectedDevices.length > 0
                    ? 'text-emerald-300'
                    : status === 'unsupported' || status === 'denied' || status === 'error'
                    ? 'text-amber-300'
                    : 'text-slate-300'
                }`}
              >
                {status === 'unsupported'
                  ? 'Web MIDI Unavailable'
                  : status === 'denied'
                  ? 'MIDI Permission Blocked'
                  : status === 'requesting'
                  ? 'Requesting Web MIDI Access...'
                  : status === 'error'
                  ? 'MIDI Connection Error'
                  : connectedDevices.length > 0
                  ? `${connectedDevices.length} Controller${
                      connectedDevices.length === 1 ? '' : 's'
                    } Connected`
                  : 'No Hardware Detected'}
              </span>

              {connectedDevices.length > 0 && (
                <>
                  <span className="text-slate-600" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-slate-400 truncate max-w-[340px]">
                    {connectedDevices.map((d) => d.name).join(', ')}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {status !== 'unsupported' && (
                <button
                  type="button"
                  onClick={onConnectMidi}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.05] hover:bg-white/[0.09] text-slate-200 border border-white/[0.08] transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3 text-cyan-400" />
                  <span>{status === 'connected' ? 'Rescan Devices' : 'Connect MIDI'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={onLoadStarterMappings}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-cyan-500/12 hover:bg-cyan-500/20 text-cyan-200 border border-cyan-400/35 transition-colors whitespace-nowrap cursor-pointer"
              >
                Load CC 1–4 Starter
              </button>

              {mappings.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAllMappings}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.04] hover:bg-rose-500/15 text-slate-300 hover:text-rose-200 border border-white/[0.08] hover:border-rose-500/30 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>

          {errorMessage && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-[11px] text-amber-200">
              {errorMessage}
            </div>
          )}

          {/* Real-time signal & learn prompt strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-2 text-slate-400 min-w-0">
              <Radio
                className={`w-3.5 h-3.5 shrink-0 ${
                  learningParam
                    ? 'text-amber-400'
                    : lastSignal
                    ? 'text-cyan-400'
                    : 'text-slate-500'
                }`}
              />
              {learningParam ? (
                <span className="text-amber-200 font-medium">
                  Listening for hardware input to bind{' '}
                  <span className="text-white font-semibold">
                    {getMidiParamSpec(learningParam).label}
                  </span>{' '}
                  — move any fader or knob…
                </span>
              ) : lastSignal ? (
                <span className="font-mono tabular-nums text-slate-300 truncate">
                  Last Input: {lastSignal.deviceName} · {formatMidiSourceLabel(lastSignal)} · Val{' '}
                  {lastSignal.rawValue} ({Math.round(lastSignal.normalized * 100)}%)
                </span>
              ) : (
                <span>
                  Click <span className="text-slate-200 font-medium">MIDI Learn</span> on any
                  parameter, then move a fader or knob on your controller.
                </span>
              )}
            </div>

            {notice && (
              <span className="text-emerald-300 font-medium flex items-center gap-1 shrink-0">
                <Check className="w-3.5 h-3.5" />
                <span>{notice}</span>
              </span>
            )}
          </div>
        </div>

        {/* Category Filter Bar */}
        <div className="px-5 py-2.5 border-b border-white/[0.07] flex items-center justify-between gap-3 shrink-0">
          <div
            role="tablist"
            aria-label="Filter parameters by category"
            className="flex items-center gap-1 p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08]"
          >
            {(
              [
                { id: 'all', label: 'All Controls' },
                { id: 'DJ Filter & FX', label: 'DJ Filter & FX' },
                { id: 'Audio & Visuals', label: 'Audio & Visuals' },
                { id: 'Lyrics & Overlay', label: 'Lyrics' },
                { id: 'Backdrop', label: 'Backdrop' },
              ] as const
            ).map((tab) => {
              const active = categoryFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCategoryFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-white/[0.1] text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {unmappedVisibleParams.length > 0 && !learningParam && (
              <button
                type="button"
                onClick={() => onSetLearningParam(unmappedVisibleParams[0].key)}
                className="px-2.5 py-1 rounded-md text-[10.5px] font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-400/35 transition-colors cursor-pointer whitespace-nowrap"
              >
                Learn Next Unmapped ({unmappedVisibleParams.length})
              </button>
            )}
            <span className="text-[11px] font-mono tabular-nums text-slate-400">
              {activeMappingsCount} active {activeMappingsCount === 1 ? 'binding' : 'bindings'}
            </span>
          </div>
        </div>

        {/* Parameter Bindings Table */}
        <div className="flex-1 min-h-0 overflow-y-auto studio-scroll p-5">
          <div className="rounded-lg bg-[#090b10] border border-white/[0.08] divide-y divide-white/[0.06]">
            {visibleParams.map((spec, idx) => {
              const mapping = mappings.find((m) => m.targetParam === spec.key);
              const isLearning = learningParam === spec.key;
              const isExpanded = expandedParam === spec.key && Boolean(mapping);
              const currentValue = settings[spec.key] ?? spec.defaultValue;
              const pct = Math.max(
                0,
                Math.min(100, ((currentValue - spec.min) / (spec.max - spec.min)) * 100)
              );

              return (
                <div
                  key={spec.key}
                  className={`px-4 py-3 transition-colors ${
                    isLearning
                      ? 'bg-amber-500/[0.07]'
                      : mapping?.enabled
                      ? 'bg-cyan-500/[0.03]'
                      : ''
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* Left: Parameter & Live Value Meter */}
                    <div className="min-w-[210px] flex-1 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-semibold text-slate-100 truncate">
                            {spec.label}
                          </span>
                          <span className="text-[10.5px] text-slate-500 shrink-0">
                            {spec.category}
                          </span>
                        </div>
                        <span className="text-xs font-mono tabular-nums text-cyan-400 shrink-0">
                          {spec.formatValue(currentValue)}
                        </span>
                      </div>

                      <div className="h-1.5 w-full rounded-full bg-white/[0.07] overflow-hidden">
                        <div
                          className="h-full bg-cyan-400/80 transition-[width] duration-75"
                          style={{ width: `${pct.toFixed(1)}%` }}
                        />
                      </div>
                    </div>

                    {/* Middle: Binding Assignment Summary */}
                    <div className="min-w-[185px] text-xs font-mono tabular-nums">
                      {mapping ? (
                        <div className="space-y-0.5">
                          <div
                            className={`font-medium ${
                              mapping.enabled ? 'text-slate-100' : 'text-slate-500 line-through'
                            }`}
                          >
                            {formatMidiSourceLabel(mapping)}
                          </div>
                          <div className="text-[10.5px] text-slate-400">
                            Range {spec.formatValue(mapping.minValue)}–
                            {spec.formatValue(mapping.maxValue)} ·{' '}
                            {mapping.curve === 'exponential' ? 'Exp' : 'Lin'}
                            {mapping.invert ? ' · Inv' : ''}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500 font-sans text-[11px]">Unassigned</span>
                      )}
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSetLearningParam(isLearning ? null : spec.key)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                          isLearning
                            ? 'bg-amber-400 text-[#090b10] border-amber-300'
                            : 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border-cyan-400/35'
                        }`}
                      >
                        {isLearning && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#090b10] opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#090b10]" />
                          </span>
                        )}
                        <span>{isLearning ? 'Listening…' : mapping ? 'Re-Learn' : 'MIDI Learn'}</span>
                      </button>

                      {mapping ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedParam(isExpanded ? null : spec.key)
                            }
                            aria-expanded={isExpanded}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                              isExpanded
                                ? 'bg-white/[0.12] border-white/[0.2] text-white'
                                : 'bg-[#121620] border-white/[0.08] text-slate-300 hover:text-white'
                            }`}
                          >
                            <Sliders className="w-3 h-3 text-cyan-400" />
                            <span>Tune</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (isExpanded) setExpandedParam(null);
                              onRemoveMapping(mapping.id);
                            }}
                            title={`Clear MIDI mapping for ${spec.label}`}
                            aria-label={`Clear MIDI mapping for ${spec.label}`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/25 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAssignManual(spec, idx)}
                          title={`Manually assign a MIDI CC to ${spec.label}`}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[#121620] hover:bg-white/[0.08] text-slate-300 border border-white/[0.08] transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Plus className="w-3 h-3 text-slate-400" />
                          <span>Manual</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Mapping Calibration Editor */}
                  {isExpanded && mapping && (
                    <div className="mt-3 pt-3 border-t border-white/[0.07] grid grid-cols-2 sm:grid-cols-6 gap-2.5 items-end">
                      <label className="space-y-1">
                        <span className="block text-[10px] text-slate-400">Message Type</span>
                        <select
                          value={mapping.messageType}
                          onChange={(e) => {
                            const nextType = e.target.value as MidiMessageType;
                            onUpdateMapping(mapping.id, {
                              messageType: nextType,
                              controller: nextType === 'pitchbend' ? 0 : mapping.controller || 1,
                            });
                          }}
                          className="w-full rounded bg-[#121620] border border-white/[0.1] px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-cyan-400/60"
                        >
                          <option value="cc">CC (Fader/Knob)</option>
                          <option value="pitchbend">Pitch Bend</option>
                          <option value="note">Note Velocity</option>
                        </select>
                      </label>

                      <label className="space-y-1">
                        <span className="block text-[10px] text-slate-400">
                          {mapping.messageType === 'note' ? 'Note #' : 'CC # (0–127)'}
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={127}
                          disabled={mapping.messageType === 'pitchbend'}
                          value={mapping.controller}
                          onChange={(e) => {
                            const val = Math.max(
                              0,
                              Math.min(127, parseInt(e.target.value || '0', 10) || 0)
                            );
                            onUpdateMapping(mapping.id, { controller: val });
                          }}
                          className="w-full rounded bg-[#121620] border border-white/[0.1] px-2 py-1 text-[11px] font-mono tabular-nums text-slate-100 outline-none focus:border-cyan-400/60 disabled:opacity-45"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="block text-[10px] text-slate-400">MIDI Channel</span>
                        <select
                          value={mapping.channel}
                          onChange={(e) =>
                            onUpdateMapping(mapping.id, {
                              channel: parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full rounded bg-[#121620] border border-white/[0.1] px-2 py-1 text-[11px] font-mono text-slate-100 outline-none focus:border-cyan-400/60"
                        >
                          <option value={-1}>Omni (Any)</option>
                          {Array.from({ length: 16 }, (_, ch) => (
                            <option key={ch} value={ch}>
                              Channel {ch + 1}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1">
                        <span className="block text-[10px] text-slate-400">
                          Min ({spec.min})
                        </span>
                        <input
                          type="number"
                          min={spec.min}
                          max={spec.max}
                          step={spec.step}
                          value={mapping.minValue}
                          onChange={(e) => {
                            const parsed = parseFloat(e.target.value);
                            if (Number.isNaN(parsed)) return;
                            onUpdateMapping(mapping.id, {
                              minValue: quantizeParamValue(parsed, spec),
                            });
                          }}
                          className="w-full rounded bg-[#121620] border border-white/[0.1] px-2 py-1 text-[11px] font-mono tabular-nums text-slate-100 outline-none focus:border-cyan-400/60"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="block text-[10px] text-slate-400">
                          Max ({spec.max})
                        </span>
                        <input
                          type="number"
                          min={spec.min}
                          max={spec.max}
                          step={spec.step}
                          value={mapping.maxValue}
                          onChange={(e) => {
                            const parsed = parseFloat(e.target.value);
                            if (Number.isNaN(parsed)) return;
                            onUpdateMapping(mapping.id, {
                              maxValue: quantizeParamValue(parsed, spec),
                            });
                          }}
                          className="w-full rounded bg-[#121620] border border-white/[0.1] px-2 py-1 text-[11px] font-mono tabular-nums text-slate-100 outline-none focus:border-cyan-400/60"
                        />
                      </label>

                      <div className="space-y-1">
                        <span className="block text-[10px] text-slate-400">Device Scope</span>
                        <select
                          value={mapping.deviceId}
                          onChange={(e) => {
                            const devId = e.target.value;
                            const found = devices.find((d) => d.id === devId);
                            onUpdateMapping(mapping.id, {
                              deviceId: devId,
                              deviceName: devId === 'any' ? 'Any Controller' : found?.name,
                            });
                          }}
                          className="w-full rounded bg-[#121620] border border-white/[0.1] px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-cyan-400/60"
                        >
                          <option value="any">Any Controller</option>
                          {devices.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-2 sm:col-span-6 flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center p-0.5 rounded-md bg-[#121620] border border-white/[0.08]">
                            {(['linear', 'exponential'] as const).map((curveType) => (
                              <button
                                key={curveType}
                                type="button"
                                onClick={() =>
                                  onUpdateMapping(mapping.id, { curve: curveType })
                                }
                                className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition-colors cursor-pointer ${
                                  mapping.curve === curveType
                                    ? 'bg-cyan-400 text-[#090b10] font-semibold'
                                    : 'text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                {curveType === 'linear' ? 'Linear' : 'Exponential'}
                              </button>
                            ))}
                          </div>

                          <button
                            type="button"
                            aria-pressed={mapping.invert}
                            onClick={() =>
                              onUpdateMapping(mapping.id, { invert: !mapping.invert })
                            }
                            className={`px-2.5 py-1 rounded-md text-[10.5px] font-medium border transition-colors cursor-pointer ${
                              mapping.invert
                                ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200'
                                : 'bg-[#121620] border-white/[0.08] text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Invert Polarity
                          </button>

                          <button
                            type="button"
                            aria-pressed={mapping.enabled}
                            onClick={() =>
                              onUpdateMapping(mapping.id, { enabled: !mapping.enabled })
                            }
                            className={`px-2.5 py-1 rounded-md text-[10.5px] font-medium border transition-colors cursor-pointer ${
                              mapping.enabled
                                ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-300'
                                : 'bg-[#121620] border-white/[0.08] text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {mapping.enabled ? 'Enabled' : 'Muted'}
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            onUpdateMapping(mapping.id, {
                              minValue: spec.min,
                              maxValue: spec.max,
                              invert: false,
                              curve: 'linear',
                            })
                          }
                          className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset Calibration</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-white/[0.08] bg-[#0d1118] flex items-center justify-between gap-4 shrink-0">
          <p className="text-[11px] text-slate-400">
            Mappings persist locally in your browser and update the live canvas at 60 fps.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Done
          </button>
        </div>

        {/* Visual MIDI Learn Listening Overlay */}
        {learningSpec && (
          <div
            onClick={() => onSetLearningParam(null)}
            className="absolute inset-0 z-20 bg-[#090b10]/85 backdrop-blur-md flex items-center justify-center p-6"
            role="status"
            aria-live="polite"
            aria-label={`Listening for MIDI input to map ${learningSpec.label}`}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-[#121620] border border-amber-400/40 shadow-[0_0_60px_rgba(251,191,36,0.16)] p-6 text-center space-y-5"
            >
              {/* Concentric Pulsing Signal Beacon */}
              <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
                <span
                  className="animate-ping absolute inset-1 rounded-full bg-amber-400/25"
                  style={{ animationDuration: '1.6s' }}
                />
                <span
                  className="animate-pulse absolute inset-3 rounded-full border border-amber-400/45 bg-amber-500/10"
                />
                <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-cyan-400 text-[#090b10] flex items-center justify-center shadow-[0_0_24px_rgba(251,191,36,0.5)]">
                  <Radio className="w-7 h-7 animate-pulse" />
                </div>
              </div>

              {/* Status Badge & Target Parameter Info */}
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/35 text-[10.5px] font-mono font-bold uppercase tracking-wider text-amber-200">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>
                    {learningExistingMapping
                      ? 'Listening to Re-Map Control'
                      : 'Listening for Unmapped Parameter'}
                  </span>
                </div>

                <h4 className="text-lg font-bold text-white tracking-tight">
                  {learningSpec.label}
                </h4>

                <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-slate-300">
                    {learningSpec.category}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-cyan-500/12 border border-cyan-400/30 text-cyan-200 tabular-nums">
                    Range {learningSpec.formatValue(learningSpec.min)} –{' '}
                    {learningSpec.formatValue(learningSpec.max)}
                  </span>
                  {learningExistingMapping && (
                    <span className="px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-slate-400">
                      Current: {formatMidiSourceLabel(learningExistingMapping)}
                    </span>
                  )}
                </div>
              </div>

              {/* Instruction & Hardware Connection State */}
              <div className="rounded-xl bg-[#090b10] border border-white/[0.08] px-4 py-3 space-y-2 text-xs">
                <p className="text-slate-200 leading-relaxed">
                  Move any <span className="text-amber-300 font-semibold">fader, rotary knob, pitch wheel</span>, or press a{' '}
                  <span className="text-cyan-300 font-semibold">MIDI pad</span> on your controller to bind it automatically.
                </p>

                {connectedDevices.length > 0 ? (
                  <div className="text-[11px] font-mono text-emerald-300 flex items-center justify-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="truncate">
                      Ready: {connectedDevices.map((d) => d.name).join(', ')}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <span className="text-[11px] text-amber-300">
                      No controller connected yet
                    </span>
                    {status !== 'unsupported' && (
                      <button
                        type="button"
                        onClick={onConnectMidi}
                        className="px-2 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/40 text-[10.5px] font-semibold cursor-pointer"
                      >
                        Connect MIDI
                      </button>
                    )}
                  </div>
                )}

                {lastSignal && (
                  <div className="pt-1 border-t border-white/[0.06] text-[10.5px] font-mono tabular-nums text-slate-400 truncate">
                    Last Signal: {formatMidiSourceLabel(lastSignal)} · Val {lastSignal.rawValue}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                {nextUnmappedParam && (
                  <button
                    type="button"
                    onClick={() => onSetLearningParam(nextUnmappedParam.key)}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/35 transition-colors cursor-pointer"
                  >
                    Skip → {nextUnmappedParam.label}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onSetLearningParam(null)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 border border-white/[0.12] transition-colors cursor-pointer"
                >
                  Cancel (Esc)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
