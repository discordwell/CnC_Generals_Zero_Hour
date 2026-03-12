import { describe, it, expect } from 'vitest';
import { RuntimeManifest } from '@generals/assets';
import {
  buildVideoIndex,
  createVideoUrlResolver,
  parseVideoIni,
  VideoPlayer,
} from './video-player.js';

const VIDEO_INI = `
; FILE: Video.ini
Video Sizzle
  Filename = sizzle_review
  Comment = This is the EA logo screen
End

Video EALogoMovie
  Filename = EA_LOGO
  Comment = This is the EA logo screen
End

Video MD_USA01
  Filename = MD_USA01_0
  Comment = campaign transition movie
End

Video GeneralsChallengeBackground
  Filename = GC_Background
  Comment = Plays in the background for GC loads
End

Video PortraitDrThraxLeft
  Filename = Comp_ThraxGen_000
  Comment = portrait transition for Generals Challenge load screen
End
`;

function makeManifest(entries: Array<{ outputPath: string; converter: string }>): RuntimeManifest {
  return new RuntimeManifest({
    version: 1,
    generatedAt: '2025-01-01T00:00:00Z',
    entryCount: entries.length,
    entries: entries.map((entry) => ({
      sourcePath: `source/${entry.outputPath}`,
      sourceHash: 'abc123',
      outputPath: entry.outputPath,
      outputHash: 'def456',
      converter: entry.converter,
      converterVersion: '1.0.0',
      timestamp: '2025-01-01T00:00:00Z',
    })),
  });
}

describe('parseVideoIni', () => {
  it('parses video entries from INI text', () => {
    const entries = parseVideoIni(VIDEO_INI);
    expect(entries.size).toBe(5);
  });

  it('maps internal name to filename', () => {
    const entries = parseVideoIni(VIDEO_INI);
    expect(entries.get('MD_USA01')!.filename).toBe('MD_USA01_0');
    expect(entries.get('Sizzle')!.filename).toBe('sizzle_review');
    expect(entries.get('EALogoMovie')!.filename).toBe('EA_LOGO');
  });

  it('preserves comments', () => {
    const entries = parseVideoIni(VIDEO_INI);
    expect(entries.get('GeneralsChallengeBackground')!.comment).toBe(
      'Plays in the background for GC loads',
    );
  });

  it('handles entries with no filename gracefully', () => {
    const ini = `
Video EmptyEntry
  Comment = no filename
End
`;
    const entries = parseVideoIni(ini);
    expect(entries.size).toBe(0);
  });

  it('indexes video-converter outputs by lowercase basename', () => {
    const manifest = makeManifest([
      { outputPath: 'videos/GC_Background.mp4', converter: 'video-converter' },
      { outputPath: 'videos/MD_USA01_0.mp4', converter: 'video-converter' },
      { outputPath: 'audio/vgenlo2a.wav', converter: 'audio-converter' },
    ]);
    const index = buildVideoIndex(manifest);

    expect(index.get('gc_background')).toBe('videos/GC_Background.mp4');
    expect(index.get('md_usa01_0')).toBe('videos/MD_USA01_0.mp4');
    expect(index.has('vgenlo2a')).toBe(false);
  });

  it('resolves Video.ini aliases through the runtime manifest', () => {
    const manifest = makeManifest([
      { outputPath: 'videos/GC_Background.mp4', converter: 'video-converter' },
      { outputPath: 'videos/MD_USA01_0.mp4', converter: 'video-converter' },
    ]);
    const resolver = createVideoUrlResolver(manifest);
    const player = new VideoPlayer({
      root: {} as HTMLElement,
      resolveVideoAssetUrl: resolver,
    });
    player.init(VIDEO_INI);

    expect(player.resolveVideoUrl('GeneralsChallengeBackground')).toBe('assets/videos/GC_Background.mp4');
    expect(player.resolveVideoUrl('MD_USA01')).toBe('assets/videos/MD_USA01_0.mp4');
    expect(player.resolveVideoUrl('MissingMovie')).toBeNull();
  });

  it('falls back to a base URL when no manifest resolver is provided', () => {
    const player = new VideoPlayer({
      root: {} as HTMLElement,
      videoBaseUrl: 'assets/videos',
    });
    player.init(VIDEO_INI);

    expect(player.resolveVideoUrl('GeneralsChallengeBackground')).toBe('assets/videos/GC_Background.mp4');
  });
});
