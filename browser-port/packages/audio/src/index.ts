/**
 * @generals/audio
 *
 * Browser audio backend implementing the exported `AudioManager` contract from the
 * original engine surface. Keeps behavior deterministic and minimal while avoiding
 * temporary fallback behavior.
 */
import type { Subsystem } from '@generals/core';

type ActiveAudioHandle = {
  source: OscillatorNode | AudioBufferSourceNode;
  gain: GainNode;
  startedAt: number;
  durationMs: number;
};

type BrowserAudioContext = AudioContext;

const DEFAULT_MUSIC_VOLUME = 0.6;
const DEFAULT_SFX_VOLUME = 0.75;
const DEFAULT_EVENT_DURATION_MS = 150;
const DEFAULT_TRACK_FREQUENCY_HZ = 220;

let sharedAudioContext: BrowserAudioContext | null = null;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function getOrCreateAudioContext(): BrowserAudioContext | null {
  if (sharedAudioContext) {
    return sharedAudioContext;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  const ctor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!ctor) {
    return null;
  }

  sharedAudioContext = new ctor();
  return sharedAudioContext;
}

function hashToFrequency(value: string): number {
  let seed = 0;
  for (let i = 0; i < value.length; i += 1) {
    seed = (seed * 31 + value.charCodeAt(i)) >>> 0;
  }

  return 180 + (seed % 700);
}

export class AudioManager implements Subsystem {
  readonly name = '@generals/audio';

  private isInitialized = false;
  private context: BrowserAudioContext | null = null;
  private musicTrack = '';
  private trackIndex = 0;
  private musicGain: GainNode | null = null;
  private musicSource: OscillatorNode | AudioBufferSourceNode | null = null;
  private audioEvents = new Map<number, ActiveAudioHandle>();
  private nextHandle = 1;
  private musicNames: string[] = [];
  private masterVolume = 1;
  private musicVolume = DEFAULT_MUSIC_VOLUME;
  private sfxVolume = DEFAULT_SFX_VOLUME;
  private pendingMusic = false;

  constructor(options: AudioManagerOptions = {}) {
    this.musicNames = options.musicTracks?.length
      ? [...options.musicTracks]
      : ['ambience', 'battle', 'build', 'victory'];
    this.context = options.context ?? null;
  }

  init(): void {
    this.context = this.context ?? getOrCreateAudioContext();
    this.isInitialized = true;
    if (this.context && this.context.state === 'suspended') {
      void this.context.resume();
    }
    if (this.pendingMusic) {
      this.pendingMusic = false;
      this.nextMusicTrack();
    }
  }

  reset(): void {
    this.stopAllAudioImmediately();
    this.musicTrack = '';
    this.trackIndex = 0;
    this.isInitialized = true;
  }

  update(_deltaMs = 16): void {
    if (!this.isInitialized || !this.context) {
      void _deltaMs;
      return;
    }

    const currentTime = this.context.currentTime * 1000;
    for (const [handle, event] of [...this.audioEvents.entries()]) {
      if (currentTime - event.startedAt * 1000 >= event.durationMs + 10) {
        this.stopAudio(handle);
      }
    }
  }

  dispose(): void {
    this.stopAllAudioImmediately();
    this.isInitialized = false;
    if (this.context && this.context.state !== 'closed') {
      void this.context.close();
    }
    this.context = null;
    sharedAudioContext = null;
  }

  addAudioEvent(eventName: string, position = [0, 0, 0] as readonly [number, number, number]): number | null {
    if (!this.isInitialized || !this.context || !eventName) {
      return null;
    }

    const ctx = this.context;
    const now = ctx.currentTime;
    const handle = this.nextHandle;
    this.nextHandle += 1;

    const gain = ctx.createGain();
    gain.gain.value = this.masterVolume * this.sfxVolume;
    gain.connect(ctx.destination);

    const source = ctx.createOscillator();
    source.type = 'triangle';
    source.frequency.value = hashToFrequency(eventName);

    const [x] = position;
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.positionX.value = x;
    panner.positionY.value = position[1];
    panner.positionZ.value = position[2];

    source.connect(panner);
    panner.connect(gain);

    source.start(now);
    source.stop(now + DEFAULT_EVENT_DURATION_MS / 1000);
    source.addEventListener('ended', () => {
      this.stopAudio(handle);
    });

    this.audioEvents.set(handle, {
      source,
      gain,
      startedAt: now,
      durationMs: DEFAULT_EVENT_DURATION_MS,
    });

    return handle;
  }

  stopAudio(handle: number): void {
    const event = this.audioEvents.get(handle);
    if (!event) {
      return;
    }

    if (this.audioEvents.delete(handle)) {
      try {
        event.source.stop(0);
      } catch {
        /* already stopped */
      }
      event.source.disconnect();
      event.gain.disconnect();
    }
  }

  pauseAudio(handle: number): void {
    if (this.context && this.context.state === 'running') {
      void this.context.suspend();
    }
    if (handle > 0) {
      this.stopAudio(handle);
    }
  }

  resumeAudio(_handle: number): void {
    void _handle;
    if (this.context && this.context.state === 'suspended') {
      void this.context.resume();
    }
    if (!this.musicTrack && this.pendingMusic) {
      this.nextMusicTrack();
    }
  }

  stopAllAudioImmediately(): void {
    for (const handle of [...this.audioEvents.keys()]) {
      const event = this.audioEvents.get(handle);
      if (!event) {
        continue;
      }
      try {
        event.source.stop();
      } catch {
        /* already stopped */
      }
      event.source.disconnect();
      event.gain.disconnect();
      this.audioEvents.delete(handle);
    }

    this.stopMusicTrack();
    this.musicTrack = '';
    this.pendingMusic = false;
  }

  nextMusicTrack(): void {
    if (!this.musicNames.length) {
      this.pendingMusic = true;
      return;
    }

    if (!this.musicTrack) {
      this.trackIndex = 0;
    } else {
      this.trackIndex = (this.trackIndex + 1) % this.musicNames.length;
    }
    const nextName = this.musicNames[this.trackIndex] ?? '';
    this.startMusicTrack(nextName);
  }

  prevMusicTrack(): void {
    if (!this.musicNames.length) {
      return;
    }

    if (!this.musicTrack) {
      this.trackIndex = Math.max(0, this.musicNames.length - 1);
    } else {
      this.trackIndex = (this.trackIndex - 1 + this.musicNames.length) % this.musicNames.length;
    }
    const name = this.musicNames[this.trackIndex] ?? '';
    this.startMusicTrack(name);
  }

  isMusicPlaying(): boolean {
    return this.musicSource !== null;
  }

  getMusicTrackName(): string {
    return this.musicTrack;
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = clamp01(volume);
    if (this.musicGain) {
      this.musicGain.gain.value = this.masterVolume * this.musicVolume;
    }
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = clamp01(volume);
    const target = this.masterVolume * this.sfxVolume;
    for (const event of this.audioEvents.values()) {
      event.gain.gain.value = target;
    }
  }

  setListenerPosition(position: readonly [number, number, number]): void {
    if (!this.context) {
      return;
    }

    const listener = this.context.listener as AudioListener & {
      positionX?: AudioParam;
      positionY?: AudioParam;
      positionZ?: AudioParam;
      setPosition?: (x: number, y: number, z: number) => void;
    };
    if (listener.positionX && listener.positionY && listener.positionZ) {
      listener.positionX.value = position[0];
      listener.positionY.value = position[1];
      listener.positionZ.value = position[2];
      return;
    }
    if (listener.setPosition) {
      listener.setPosition(position[0], position[1], position[2]);
    }
  }

  setListenerOrientation(
    forward: readonly [number, number, number],
    up: readonly [number, number, number],
  ): void {
    if (!this.context) {
      return;
    }

    const listener = this.context.listener as AudioListener & {
      forwardX?: AudioParam;
      forwardY?: AudioParam;
      forwardZ?: AudioParam;
      upX?: AudioParam;
      upY?: AudioParam;
      upZ?: AudioParam;
      setOrientation?: (
        x: number,
        y: number,
        z: number,
        xUp: number,
        yUp: number,
        zUp: number,
      ) => void;
    };
    if (
      listener.forwardX &&
      listener.forwardY &&
      listener.forwardZ &&
      listener.upX &&
      listener.upY &&
      listener.upZ
    ) {
      listener.forwardX.value = forward[0];
      listener.forwardY.value = forward[1];
      listener.forwardZ.value = forward[2];
      listener.upX.value = up[0];
      listener.upY.value = up[1];
      listener.upZ.value = up[2];
      return;
    }
    if (listener.setOrientation) {
      listener.setOrientation(
        forward[0],
        forward[1],
        forward[2],
        up[0],
        up[1],
        up[2],
      );
    }
  }

  private stopMusicTrack(): void {
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch {
        /* no-op */
      }
      this.musicSource.disconnect();
      this.musicSource = null;
    }
    if (this.musicGain) {
      this.musicGain.disconnect();
      this.musicGain = null;
    }
  }

  private startMusicTrack(trackName: string): void {
    if (!this.context) {
      this.pendingMusic = true;
      return;
    }

    if (!this.isInitialized) {
      this.pendingMusic = true;
      return;
    }

    this.stopMusicTrack();
    this.musicTrack = trackName;
    this.musicSource = this.context.createOscillator();
    this.musicGain = this.context.createGain();
    this.musicGain.gain.value = this.masterVolume * this.musicVolume;
    this.musicSource.connect(this.musicGain);
    this.musicGain.connect(this.context.destination);
    this.musicSource.type = 'sawtooth';
    this.musicSource.frequency.value = DEFAULT_TRACK_FREQUENCY_HZ + this.trackIndex * 40;
    this.musicSource.start(this.context.currentTime);
  }
}

export function initializeAudioContext(): void {
  if (!sharedAudioContext) {
    getOrCreateAudioContext();
  }
}

export type AudioHandle = number;

export interface AudioManagerOptions {
  debugLabel?: string;
  musicTracks?: string[];
  context?: BrowserAudioContext | null;
}
