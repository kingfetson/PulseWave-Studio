import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MidiConnectionStatus,
  MidiDeviceInfo,
  MidiSignalEvent,
} from '../types/midi';
import { parseMidiMessage } from '../utils/midiMapping';

interface UseMidiControllerOptions {
  active: boolean;
  onSignal: (signal: MidiSignalEvent) => void;
}

export function useMidiController({ active, onSignal }: UseMidiControllerOptions) {
  const [status, setStatus] = useState<MidiConnectionStatus>(() =>
    typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function'
      ? 'idle'
      : 'unsupported'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [devices, setDevices] = useState<MidiDeviceInfo[]>([]);
  const [lastSignal, setLastSignal] = useState<MidiSignalEvent | null>(null);

  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;

  const syncInputs = useCallback((access: MIDIAccess) => {
    const nextDevices: MidiDeviceInfo[] = [];

    access.inputs.forEach((input) => {
      const name = input.name?.trim() || 'MIDI Input Device';
      const manufacturer = input.manufacturer?.trim() || 'Unknown Vendor';
      nextDevices.push({
        id: input.id,
        name,
        manufacturer,
        state: input.state === 'connected' ? 'connected' : 'disconnected',
      });

      input.onmidimessage = (event: MIDIMessageEvent) => {
        if (!event.data) return;
        const parsed = parseMidiMessage(event.data, input.id, name);
        if (!parsed) return;
        setLastSignal(parsed);
        onSignalRef.current(parsed);
      };
    });

    nextDevices.sort((a, b) => a.name.localeCompare(b.name));
    setDevices(nextDevices);
  }, []);

  const connectMidi = useCallback(async () => {
    if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') {
      setStatus('unsupported');
      setErrorMessage(
        'Web MIDI API is not supported in this browser. Use Chrome, Edge, or Opera over HTTPS.'
      );
      return;
    }

    if (midiAccessRef.current) {
      syncInputs(midiAccessRef.current);
      setStatus('connected');
      setErrorMessage(null);
      return;
    }

    setStatus('requesting');
    setErrorMessage(null);

    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      midiAccessRef.current = access;
      syncInputs(access);
      access.onstatechange = () => {
        syncInputs(access);
      };
      setStatus('connected');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const denied =
        err instanceof DOMException &&
        (err.name === 'SecurityError' || err.name === 'NotAllowedError');
      setStatus(denied ? 'denied' : 'error');
      setErrorMessage(
        denied
          ? 'MIDI access permission was denied or blocked by browser policy. Allow MIDI devices in site settings and click Connect.'
          : msg || 'Unable to initialize Web MIDI access.'
      );
    }
  }, [syncInputs]);

  // Automatically attach Web MIDI if active (or check granted permissions cleanly)
  useEffect(() => {
    if (!active) return;
    if (status === 'unsupported' || status === 'denied') return;
    if (midiAccessRef.current) return;

    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await connectMidi();
    })();

    return () => {
      cancelled = true;
    };
  }, [active, status, connectMidi]);

  // Detach input handlers cleanly on unmount
  useEffect(() => {
    return () => {
      const access = midiAccessRef.current;
      if (!access) return;
      access.onstatechange = null;
      access.inputs.forEach((input) => {
        input.onmidimessage = null;
      });
    };
  }, []);

  return {
    status,
    errorMessage,
    devices,
    lastSignal,
    connectMidi,
  };
}
