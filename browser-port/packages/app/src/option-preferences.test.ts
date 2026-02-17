import { describe, expect, it } from 'vitest';

import {
  extractAudioOptionPreferences,
  loadOptionPreferencesFromStorage,
  parseOptionPreferencesText,
} from './option-preferences.js';

describe('parseOptionPreferencesText', () => {
  it('parses key-value lines from Options.ini text', () => {
    const parsed = parseOptionPreferencesText(`
      SFXVolume = 75
      SFX3DVolume = 66.5
      VoiceVolume = 44
      MusicVolume = 32
      SpeakerType = Headphones
      3DAudioProvider = Miles Fast 2D Positional Audio
    `);

    expect(parsed.get('SFXVolume')).toBe('75');
    expect(parsed.get('SFX3DVolume')).toBe('66.5');
    expect(parsed.get('VoiceVolume')).toBe('44');
    expect(parsed.get('MusicVolume')).toBe('32');
    expect(parsed.get('SpeakerType')).toBe('Headphones');
    expect(parsed.get('3DAudioProvider')).toBe('Miles Fast 2D Positional Audio');
  });

  it('ignores malformed lines and empty key/value pairs', () => {
    const parsed = parseOptionPreferencesText(`
      NoEqualsLine
      MissingValue =
      = MissingKey
      Valid = Yes
    `);

    expect(parsed.size).toBe(1);
    expect(parsed.get('Valid')).toBe('Yes');
  });
});

describe('loadOptionPreferencesFromStorage', () => {
  it('loads and parses Options.ini text from storage key', () => {
    const storage: Pick<Storage, 'getItem'> = {
      getItem(key: string): string | null {
        return key === 'Options.ini' ? 'SFXVolume = 88' : null;
      },
    };

    const parsed = loadOptionPreferencesFromStorage(storage);
    expect(parsed.get('SFXVolume')).toBe('88');
  });

  it('returns empty map when storage access throws', () => {
    const storage: Pick<Storage, 'getItem'> = {
      getItem(): string | null {
        throw new Error('storage denied');
      },
    };

    const parsed = loadOptionPreferencesFromStorage(storage);
    expect(parsed.size).toBe(0);
  });
});

describe('extractAudioOptionPreferences', () => {
  it('extracts supported audio keys and clamps invalid volumes like source', () => {
    const prefs = new Map<string, string>([
      ['SFXVolume', '120'],
      ['SFX3DVolume', '-5'],
      ['VoiceVolume', 'not-a-number'],
      ['MusicVolume', '70'],
      ['SpeakerType', '  2 Speakers  '],
      ['3DAudioProvider', '  Miles 3D  '],
    ]);

    const extracted = extractAudioOptionPreferences(prefs);
    expect(extracted).toEqual({
      preferred3DProvider: 'Miles 3D',
      speakerType: '2 Speakers',
      sfxVolumePercent: 120,
      sfx3DVolumePercent: 0,
      voiceVolumePercent: 0,
      musicVolumePercent: 70,
    });
  });
});
