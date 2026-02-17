import type { AudioSettingsConfig } from '@generals/ini-data';

import type { AudioOptionPreferences } from './option-preferences.js';

export interface ResolvedSfxVolumes {
  sound2D?: number;
  sound3D?: number;
  speech?: number;
  music?: number;
  usedRelative2DVolume: boolean;
  unresolvedRelative2DVolume: boolean;
  usedOptionPreferenceOverrides: boolean;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function clampRelative2D(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(-1, value));
}

function clampPercentToReal(value: number): number {
  return clamp01(value / 100);
}

export function resolveSfxVolumesFromAudioSettings(
  audioSettings: AudioSettingsConfig,
  optionPreferences?: AudioOptionPreferences,
): ResolvedSfxVolumes {
  const explicit2D = optionPreferences?.sfxVolumePercent !== undefined
    ? clampPercentToReal(optionPreferences.sfxVolumePercent)
    : typeof audioSettings.defaultSoundVolume === 'number'
      ? clamp01(audioSettings.defaultSoundVolume)
      : undefined;
  const explicit3D = optionPreferences?.sfx3DVolumePercent !== undefined
    ? clampPercentToReal(optionPreferences.sfx3DVolumePercent)
    : typeof audioSettings.default3DSoundVolume === 'number'
      ? clamp01(audioSettings.default3DSoundVolume)
      : undefined;
  const explicitSpeech = optionPreferences?.voiceVolumePercent !== undefined
    ? clampPercentToReal(optionPreferences.voiceVolumePercent)
    : typeof audioSettings.defaultSpeechVolume === 'number'
      ? clamp01(audioSettings.defaultSpeechVolume)
      : undefined;
  const explicitMusic = optionPreferences?.musicVolumePercent !== undefined
    ? clampPercentToReal(optionPreferences.musicVolumePercent)
    : typeof audioSettings.defaultMusicVolume === 'number'
      ? clamp01(audioSettings.defaultMusicVolume)
      : undefined;
  const relative2D = typeof audioSettings.relative2DVolume === 'number'
    ? clampRelative2D(audioSettings.relative2DVolume)
    : undefined;
  const usedOptionPreferenceOverrides = optionPreferences !== undefined
    && (
      optionPreferences.sfxVolumePercent !== undefined
      || optionPreferences.sfx3DVolumePercent !== undefined
      || optionPreferences.voiceVolumePercent !== undefined
      || optionPreferences.musicVolumePercent !== undefined
    );

  if (explicit2D !== undefined && explicit3D !== undefined && relative2D === undefined) {
    return {
      sound2D: explicit2D,
      sound3D: explicit3D,
      speech: explicitSpeech,
      music: explicitMusic,
      usedRelative2DVolume: false,
      unresolvedRelative2DVolume: false,
      usedOptionPreferenceOverrides,
    };
  }

  if (relative2D === undefined) {
    return {
      sound2D: explicit2D,
      sound3D: explicit3D,
      speech: explicitSpeech,
      music: explicitMusic,
      usedRelative2DVolume: false,
      unresolvedRelative2DVolume: false,
      usedOptionPreferenceOverrides,
    };
  }

  let sound2D = explicit2D;
  let sound3D = explicit3D;
  let usedRelative2DVolume = false;

  if (optionPreferences?.sfxVolumePercent === undefined && sound2D !== undefined && relative2D < 0) {
    sound2D = clamp01(sound2D * (1 + relative2D));
    usedRelative2DVolume = true;
  }

  if (optionPreferences?.sfx3DVolumePercent === undefined && sound3D !== undefined && relative2D > 0) {
    sound3D = clamp01(sound3D * (1 - relative2D));
    usedRelative2DVolume = true;
  }

  return {
    sound2D,
    sound3D,
    speech: explicitSpeech,
    music: explicitMusic,
    usedRelative2DVolume,
    unresolvedRelative2DVolume:
      relative2D !== undefined
      && (
        optionPreferences?.sfxVolumePercent === undefined
        && optionPreferences?.sfx3DVolumePercent === undefined
        && (sound2D === undefined || sound3D === undefined)
      ),
    usedOptionPreferenceOverrides,
  };
}
