import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { IniDataRegistry } from '@generals/ini-data';
import { parseCampaignIni } from '@generals/game-logic';
import {
  buildChallengePersonasFromRegistry,
  ChallengeGenerals,
  getEnabledChallengePersonas,
  NUM_GENERALS,
} from './challenge-generals.js';

// In-memory storage mock
class MockStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(_index: number) { return null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

const RETAIL_ASSETS_ROOT = path.resolve(
  __dirname,
  '..',
  '..',
  'app',
  'public',
  'assets',
);
const RETAIL_BUNDLE_PATH = path.join(
  RETAIL_ASSETS_ROOT,
  'data',
  'ini-bundle.json',
);
const RETAIL_CAMPAIGN_INI_PATH = path.join(
  RETAIL_ASSETS_ROOT,
  '_extracted',
  'INIZH',
  'Data',
  'INI',
  'Campaign.ini',
);
const RETAIL_LOCALIZATION_PATH = path.join(
  RETAIL_ASSETS_ROOT,
  'localization',
  'EnglishZH',
  'Data',
  'English',
  'generals.json',
);

describe('ChallengeGenerals', () => {
  let storage: MockStorage;

  beforeEach(() => {
    storage = new MockStorage();
  });

  it('initializes with 9 general personas', () => {
    const cg = new ChallengeGenerals(storage);
    expect(cg.getPersonas().length).toBe(NUM_GENERALS);
  });

  it('each persona has unique index and campaign name', () => {
    const cg = new ChallengeGenerals(storage);
    const personas = cg.getPersonas();
    const indices = new Set(personas.map(p => p.index));
    const campaigns = new Set(personas.map(p => p.campaignName));
    expect(indices.size).toBe(NUM_GENERALS);
    expect(campaigns.size).toBe(NUM_GENERALS);
  });

  it('looks up persona by index', () => {
    const cg = new ChallengeGenerals(storage);
    const p = cg.getPersona(0);
    expect(p).not.toBeNull();
    expect(p!.name).toBe('General Granger');
  });

  it('looks up persona by campaign name', () => {
    const cg = new ChallengeGenerals(storage);
    const p = cg.getPersonaByCampaignName('CHALLENGE_1');
    expect(p).not.toBeNull();
    expect(p!.name).toBe('Dr. Thrax');
  });

  it('looks up persona by template name', () => {
    const cg = new ChallengeGenerals(storage);
    const p = cg.getPersonaByTemplateName('FactionChinaTankGeneral');
    expect(p).not.toBeNull();
    expect(p!.name).toBe('General Kwai');
  });

  it('returns null for unknown persona', () => {
    const cg = new ChallengeGenerals(storage);
    expect(cg.getPersona(99)).toBeNull();
    expect(cg.getPersonaByCampaignName('nonexistent')).toBeNull();
  });

  it('tracks defeated generals', () => {
    const cg = new ChallengeGenerals(storage);
    expect(cg.isDefeated(0)).toBe(false);
    cg.markDefeated(0);
    expect(cg.isDefeated(0)).toBe(true);
    expect(cg.getDefeatedIndices()).toEqual([0]);
  });

  it('persists defeated generals to storage', () => {
    const cg1 = new ChallengeGenerals(storage);
    cg1.markDefeated(2);
    cg1.markDefeated(5);

    // Create new instance with same storage
    const cg2 = new ChallengeGenerals(storage);
    expect(cg2.isDefeated(2)).toBe(true);
    expect(cg2.isDefeated(5)).toBe(true);
    expect(cg2.isDefeated(0)).toBe(false);
  });

  it('resets progress', () => {
    const cg = new ChallengeGenerals(storage);
    cg.markDefeated(0);
    cg.markDefeated(1);
    cg.resetProgress();
    expect(cg.isDefeated(0)).toBe(false);
    expect(cg.getDefeatedIndices()).toEqual([]);
  });

  it('handles null storage gracefully', () => {
    const cg = new ChallengeGenerals(null);
    cg.markDefeated(0);
    expect(cg.isDefeated(0)).toBe(true);
    // No error thrown
  });

  it('handles corrupt storage data', () => {
    storage.setItem('generals_challenge_progress', 'not-json');
    const cg = new ChallengeGenerals(storage);
    expect(cg.getDefeatedIndices()).toEqual([]);
  });
});

describe('buildChallengePersonasFromRegistry', () => {
  function createRegistry(): IniDataRegistry {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      {
        type: 'ChallengeGenerals',
        name: '',
        fields: {},
        blocks: [
          {
            type: 'GeneralPersona0',
            name: '',
            fields: {
              StartsEnabled: true,
              BioNameString: 'GUI:BioNameEntry_Pos0',
              Campaign: 'CHALLENGE_0',
              PlayerTemplate: 'FactionAmericaAirForceGeneral',
              PortraitMovieLeftName: 'PortraitAirGenLeft',
              PortraitMovieRightName: 'PortraitAirGenRight',
            },
            blocks: [],
          },
          {
            type: 'GeneralPersona8',
            name: '',
            fields: {
              StartsEnabled: true,
              BioNameString: 'GUI:BioNameEntry_Pos8',
              Campaign: 'CHALLENGE_8',
              PlayerTemplate: 'FactionGLADemolitionGeneral',
              PortraitMovieLeftName: 'PortraitDemolitionGenLeft',
              PortraitMovieRightName: 'PortraitDemolitionGenRight',
            },
            blocks: [],
          },
          {
            type: 'GeneralPersona9',
            name: '',
            fields: {
              StartsEnabled: false,
              BioNameString: 'GUI:BioNameEntry_Pos9',
              Campaign: 'unimplemented',
              PlayerTemplate: 'FactionBossGeneral',
              PortraitMovieLeftName: 'PortraitBossGenLeft',
              PortraitMovieRightName: 'PortraitBossGenRight',
            },
            blocks: [],
          },
        ],
      },
    ]);
    return registry;
  }

  it('builds personas from source challenge blocks', () => {
    const personas = buildChallengePersonasFromRegistry(createRegistry());

    expect(personas).toHaveLength(3);
    expect(personas[0]).toMatchObject({
      index: 0,
      startsEnabled: true,
      campaignName: 'challenge_0',
      playerTemplateName: 'FactionAmericaAirForceGeneral',
      name: 'General Granger',
    });
    expect(personas[1]).toMatchObject({
      index: 8,
      startsEnabled: true,
      campaignName: 'challenge_8',
      playerTemplateName: 'FactionGLADemolitionGeneral',
      name: 'GLA Demolition General',
    });
    expect(personas[2]).toMatchObject({
      index: 9,
      startsEnabled: false,
      campaignName: 'unimplemented',
      playerTemplateName: 'FactionBossGeneral',
    });
  });

  it('filters to playable challenge personas', () => {
    const enabled = getEnabledChallengePersonas(
      buildChallengePersonasFromRegistry(createRegistry()),
    );

    expect(enabled.map((persona) => persona.campaignName)).toEqual([
      'challenge_0',
      'challenge_8',
    ]);
  });

  it('matches retail challenge personas to retail challenge campaigns and localized names', () => {
    if (
      !fs.existsSync(RETAIL_BUNDLE_PATH)
      || !fs.existsSync(RETAIL_CAMPAIGN_INI_PATH)
      || !fs.existsSync(RETAIL_LOCALIZATION_PATH)
    ) {
      return;
    }

    const registry = new IniDataRegistry();
    registry.loadBundle(JSON.parse(fs.readFileSync(RETAIL_BUNDLE_PATH, 'utf8')));

    const personas = getEnabledChallengePersonas(
      buildChallengePersonasFromRegistry(registry),
    );
    const challengeCampaigns = parseCampaignIni(fs.readFileSync(RETAIL_CAMPAIGN_INI_PATH, 'utf8'))
      .filter((campaign) => campaign.isChallengeCampaign);
    const localizedEntries = (
      JSON.parse(fs.readFileSync(RETAIL_LOCALIZATION_PATH, 'utf8')) as {
        entries: Record<string, { text: string }>;
      }
    ).entries;

    expect(personas).toHaveLength(9);
    expect(challengeCampaigns).toHaveLength(9);

    const campaignByName = new Map(challengeCampaigns.map((campaign) => [campaign.name, campaign] as const));
    for (const persona of personas) {
      const campaign = campaignByName.get(persona.campaignName);
      expect(campaign, `retail challenge campaign "${persona.campaignName}" should exist`).toBeDefined();
      if (campaign?.playerFactionName) {
        expect(
          campaign.playerFactionName,
          `campaign "${persona.campaignName}" should use persona template "${persona.playerTemplateName}" when PlayerFaction is present`,
        ).toBe(persona.playerTemplateName);
      }
      expect(
        localizedEntries[persona.bioNameLabel]?.text.length ?? 0,
        `localized name should exist for "${persona.bioNameLabel}"`,
      ).toBeGreaterThan(0);
    }
  });
});
