import { describe, expect, it } from 'vitest';

import { resolveSfxVolumesFromAudioSettings } from './audio-settings.js';

describe('resolveSfxVolumesFromAudioSettings', () => {
  it('uses default audio settings when option preferences are absent', () => {
    const resolved = resolveSfxVolumesFromAudioSettings({
      defaultSoundVolume: 0.8,
      default3DSoundVolume: 0.6,
      defaultSpeechVolume: 0.5,
      defaultMusicVolume: 0.4,
    });

    expect(resolved).toEqual({
      sound2D: 0.8,
      sound3D: 0.6,
      speech: 0.5,
      music: 0.4,
      usedRelative2DVolume: false,
      unresolvedRelative2DVolume: false,
      usedOptionPreferenceOverrides: false,
    });
  });

  it('keeps 2D unchanged while scaling 3D down when relative2D is positive', () => {
    const resolved = resolveSfxVolumesFromAudioSettings({
      defaultSoundVolume: 0.75,
      default3DSoundVolume: 0.6,
      relative2DVolume: 0.2,
    });

    expect(resolved.sound2D).toBeCloseTo(0.75);
    expect(resolved.sound3D).toBeCloseTo(0.48);
    expect(resolved.usedRelative2DVolume).toBe(true);
    expect(resolved.unresolvedRelative2DVolume).toBe(false);
    expect(resolved.usedOptionPreferenceOverrides).toBe(false);
  });

  it('applies relative2D only to default 3D volume when relative is positive', () => {
    const resolved = resolveSfxVolumesFromAudioSettings({
      defaultSoundVolume: 0.75,
      default3DSoundVolume: 0.6,
      relative2DVolume: 0.25,
    });

    expect(resolved.sound2D).toBeCloseTo(0.75);
    expect(resolved.sound3D).toBeCloseTo(0.45);
    expect(resolved.usedRelative2DVolume).toBe(true);
    expect(resolved.unresolvedRelative2DVolume).toBe(false);
    expect(resolved.usedOptionPreferenceOverrides).toBe(false);
  });

  it('applies relative2D only to default 2D volume when relative is negative', () => {
    const resolved = resolveSfxVolumesFromAudioSettings({
      defaultSoundVolume: 0.75,
      default3DSoundVolume: 0.6,
      relative2DVolume: -0.2,
    });

    expect(resolved.sound2D).toBeCloseTo(0.6);
    expect(resolved.sound3D).toBeCloseTo(0.6);
    expect(resolved.usedRelative2DVolume).toBe(true);
    expect(resolved.unresolvedRelative2DVolume).toBe(false);
    expect(resolved.usedOptionPreferenceOverrides).toBe(false);
  });

  it('uses option preferences as source overrides for all volume channels', () => {
    const resolved = resolveSfxVolumesFromAudioSettings(
      {
        defaultSoundVolume: 0.75,
        default3DSoundVolume: 0.6,
        defaultSpeechVolume: 0.5,
        defaultMusicVolume: 0.4,
        relative2DVolume: -0.5,
      },
      {
        sfxVolumePercent: 90,
        sfx3DVolumePercent: 70,
        voiceVolumePercent: 60,
        musicVolumePercent: 50,
      },
    );

    expect(resolved).toEqual({
      sound2D: 0.9,
      sound3D: 0.7,
      speech: 0.6,
      music: 0.5,
      usedRelative2DVolume: false,
      unresolvedRelative2DVolume: false,
      usedOptionPreferenceOverrides: true,
    });
  });

  it('flags unresolved relative fallback when defaults are missing', () => {
    const resolved = resolveSfxVolumesFromAudioSettings({
      relative2DVolume: -1,
    });

    expect(resolved).toEqual({
      sound2D: undefined,
      sound3D: undefined,
      speech: undefined,
      music: undefined,
      usedRelative2DVolume: false,
      unresolvedRelative2DVolume: true,
      usedOptionPreferenceOverrides: false,
    });
  });
});
