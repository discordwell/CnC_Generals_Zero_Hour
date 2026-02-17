export interface AudioOptionPreferences {
  preferred3DProvider?: string;
  speakerType?: string;
  sfxVolumePercent?: number;
  sfx3DVolumePercent?: number;
  voiceVolumePercent?: number;
  musicVolumePercent?: number;
}

function parseOptionPreferenceVolume(value: string): number {
  // Source behavior from OptionPreferences::get*Volume:
  // values use atof and clamp at 0 for negatives.
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

export function parseOptionPreferencesText(text: string): Map<string, string> {
  const preferences = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    if (!key || !value) {
      continue;
    }
    preferences.set(key, value);
  }
  return preferences;
}

export function loadOptionPreferencesFromStorage(
  storage: Pick<Storage, 'getItem'> | null | undefined,
  storageKey = 'Options.ini',
): Map<string, string> {
  if (!storage) {
    return new Map();
  }

  try {
    const text = storage.getItem(storageKey);
    if (!text) {
      return new Map();
    }
    return parseOptionPreferencesText(text);
  } catch {
    return new Map();
  }
}

export function extractAudioOptionPreferences(
  preferences: ReadonlyMap<string, string>,
): AudioOptionPreferences {
  const preferred3DProvider = preferences.get('3DAudioProvider')?.trim() || undefined;
  const speakerType = preferences.get('SpeakerType')?.trim() || undefined;
  const sfxVolume = preferences.get('SFXVolume');
  const sfx3DVolume = preferences.get('SFX3DVolume');
  const voiceVolume = preferences.get('VoiceVolume');
  const musicVolume = preferences.get('MusicVolume');

  return {
    preferred3DProvider,
    speakerType,
    sfxVolumePercent: sfxVolume !== undefined ? parseOptionPreferenceVolume(sfxVolume) : undefined,
    sfx3DVolumePercent: sfx3DVolume !== undefined ? parseOptionPreferenceVolume(sfx3DVolume) : undefined,
    voiceVolumePercent: voiceVolume !== undefined ? parseOptionPreferenceVolume(voiceVolume) : undefined,
    musicVolumePercent: musicVolume !== undefined ? parseOptionPreferenceVolume(musicVolume) : undefined,
  };
}
