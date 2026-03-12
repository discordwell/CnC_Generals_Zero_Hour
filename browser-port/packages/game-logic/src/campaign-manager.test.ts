import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  CampaignManager,
  parseCampaignIni,
  resolveCampaignMapAssetPath,
  type Campaign,
} from './campaign-manager.js';

const MINIMAL_CAMPAIGN_INI = `
Campaign USA
  CampaignNameLabel CAMPAIGN:USA
  FirstMission Mission01
  Mission Mission01
    Map Maps\\MD_USA01\\MD_USA01.map
    IntroMovie MD_USA01
    NextMission Mission02
  END
  Mission Mission02
    Map Maps\\MD_USA02\\MD_USA02.map
    IntroMovie MD_USA02
  END
END

Campaign GLA
  CampaignNameLabel CAMPAIGN:GLA
  FirstMission Mission01
  Mission Mission01
    Map Maps\\MD_GLA01\\MD_GLA01.map
    IntroMovie MD_GLA01
  END
END

Campaign CHALLENGE_0
  CampaignNameLabel CAMPAIGN:CHALLENGE_0
  FirstMission Mission01
  IsChallengeCampaign yes
  PlayerFaction FactionAmericaAirForceGeneral
  Mission Mission01
    Map Maps\\GC_ChemGeneral\\GC_ChemGeneral.map
    GeneralName GUI:BioNameEntry_Pos1
    IntroMovie GeneralsChallengeBackground
    NextMission Mission02
  END
  Mission Mission02
    Map Maps\\GC_ChinaBoss\\GC_ChinaBoss.map
    GeneralName GUI:BioNameEntry_Pos9
    IntroMovie GeneralsChallengeBackground
  END
END

Campaign TRAINING
  CampaignNameLabel CAMPAIGN:TRAINING
  FirstMission Mission01
  Mission Mission01
    Map Maps\\Training01\\Training01.map
    IntroMovie TrainingCampaign
    ObjectiveLine0 GUI:Objectives:
    ObjectiveLine1 LOAD:TRAINING_1
    ObjectiveLine2 LOAD:TRAINING_2
    BriefingVoice BriefingUSATraining
    UnitNames0 OBJECT:Ranger
    UnitNames1 OBJECT:Humvee
    UnitNames2 OBJECT:Crusader
    LocationNameLabel OBJECT:Mazar
    VoiceLength = 17
  END
END
`;

const RETAIL_ASSETS_ROOT = path.resolve(
  __dirname,
  '..',
  '..',
  'app',
  'public',
  'assets',
);
const RETAIL_CAMPAIGN_INI_PATH = path.join(
  RETAIL_ASSETS_ROOT,
  '_extracted',
  'INIZH',
  'Data',
  'INI',
  'Campaign.ini',
);
const RETAIL_MANIFEST_PATH = path.join(
  RETAIL_ASSETS_ROOT,
  'manifest.json',
);
const RETAIL_LOCALIZATION_PATH = path.join(
  RETAIL_ASSETS_ROOT,
  'localization',
  'EnglishZH',
  'Data',
  'English',
  'generals.json',
);

describe('parseCampaignIni', () => {
  it('parses campaigns from INI text', () => {
    const campaigns = parseCampaignIni(MINIMAL_CAMPAIGN_INI);
    expect(campaigns.length).toBe(4);
  });

  it('parses campaign names as lowercase', () => {
    const campaigns = parseCampaignIni(MINIMAL_CAMPAIGN_INI);
    const names = campaigns.map(c => c.name);
    expect(names).toContain('usa');
    expect(names).toContain('gla');
    expect(names).toContain('challenge_0');
    expect(names).toContain('training');
  });

  it('parses campaign-level fields', () => {
    const campaigns = parseCampaignIni(MINIMAL_CAMPAIGN_INI);
    const usa = campaigns.find(c => c.name === 'usa')!;
    expect(usa.firstMission).toBe('mission01');
    expect(usa.campaignNameLabel).toBe('CAMPAIGN:USA');
    expect(usa.isChallengeCampaign).toBe(false);
  });

  it('parses challenge campaign fields', () => {
    const campaigns = parseCampaignIni(MINIMAL_CAMPAIGN_INI);
    const challenge = campaigns.find(c => c.name === 'challenge_0')!;
    expect(challenge.isChallengeCampaign).toBe(true);
    expect(challenge.playerFactionName).toBe('FactionAmericaAirForceGeneral');
  });

  it('parses missions within campaigns', () => {
    const campaigns = parseCampaignIni(MINIMAL_CAMPAIGN_INI);
    const usa = campaigns.find(c => c.name === 'usa')!;
    expect(usa.missions.length).toBe(2);
    expect(usa.missions[0]!.name).toBe('mission01');
    expect(usa.missions[0]!.mapName).toBe('Maps\\MD_USA01\\MD_USA01.map');
    expect(usa.missions[0]!.movieLabel).toBe('MD_USA01');
    expect(usa.missions[0]!.nextMission).toBe('mission02');
  });

  it('parses mission with no next mission', () => {
    const campaigns = parseCampaignIni(MINIMAL_CAMPAIGN_INI);
    const usa = campaigns.find(c => c.name === 'usa')!;
    expect(usa.missions[1]!.nextMission).toBe('');
  });

  it('parses training mission detailed fields', () => {
    const campaigns = parseCampaignIni(MINIMAL_CAMPAIGN_INI);
    const training = campaigns.find(c => c.name === 'training')!;
    const m = training.missions[0]!;
    expect(m.objectiveLines).toEqual(['GUI:Objectives:', 'LOAD:TRAINING_1', 'LOAD:TRAINING_2']);
    expect(m.briefingVoice).toBe('BriefingUSATraining');
    expect(m.unitNames).toEqual(['OBJECT:Ranger', 'OBJECT:Humvee', 'OBJECT:Crusader']);
    expect(m.locationNameLabel).toBe('OBJECT:Mazar');
    expect(m.voiceLength).toBe(17);
  });

  it('parses general name for challenge missions', () => {
    const campaigns = parseCampaignIni(MINIMAL_CAMPAIGN_INI);
    const challenge = campaigns.find(c => c.name === 'challenge_0')!;
    expect(challenge.missions[0]!.generalName).toBe('GUI:BioNameEntry_Pos1');
  });

  it('strips comments from lines', () => {
    const ini = `
Campaign Test
  CampaignNameLabel CAMPAIGN:TEST
  FirstMission Mission01
;  FinalVictoryMovie SomeMovie
  Mission Mission01
    Map Maps\\Test\\Test.map
  END
END
`;
    const campaigns = parseCampaignIni(ini);
    expect(campaigns[0]!.finalMovieName).toBe('');
  });
});

describe('CampaignManager', () => {
  function createManager(): CampaignManager {
    const mgr = new CampaignManager();
    mgr.init(MINIMAL_CAMPAIGN_INI);
    return mgr;
  }

  it('initializes with all campaigns', () => {
    const mgr = createManager();
    expect(mgr.getCampaigns().length).toBe(4);
  });

  it('setCampaign selects campaign and first mission', () => {
    const mgr = createManager();
    expect(mgr.setCampaign('USA')).toBe(true);
    expect(mgr.getCurrentCampaign()!.name).toBe('usa');
    expect(mgr.getCurrentMission()!.name).toBe('mission01');
  });

  it('setCampaign is case-insensitive', () => {
    const mgr = createManager();
    expect(mgr.setCampaign('gla')).toBe(true);
    expect(mgr.getCurrentCampaign()!.name).toBe('gla');
  });

  it('setCampaign returns false for unknown campaign', () => {
    const mgr = createManager();
    expect(mgr.setCampaign('UNKNOWN')).toBe(false);
    expect(mgr.getCurrentCampaign()).toBeNull();
  });

  it('gotoNextMission advances to next mission', () => {
    const mgr = createManager();
    mgr.setCampaign('USA');
    expect(mgr.getCurrentMission()!.name).toBe('mission01');
    const next = mgr.gotoNextMission();
    expect(next).not.toBeNull();
    expect(next!.name).toBe('mission02');
  });

  it('gotoNextMission returns null at end of campaign', () => {
    const mgr = createManager();
    mgr.setCampaign('USA');
    mgr.gotoNextMission(); // -> mission02
    const end = mgr.gotoNextMission(); // -> null (no more)
    expect(end).toBeNull();
  });

  it('gotoNextMission returns null when already at end', () => {
    const mgr = createManager();
    mgr.setCampaign('USA');
    mgr.gotoNextMission(); // -> mission02
    mgr.gotoNextMission(); // -> null
    expect(mgr.gotoNextMission()).toBeNull(); // still null
  });

  it('getCurrentMap returns mission map path', () => {
    const mgr = createManager();
    mgr.setCampaign('USA');
    expect(mgr.getCurrentMap()).toBe('Maps\\MD_USA01\\MD_USA01.map');
  });

  it('getCurrentMap returns empty string when no mission', () => {
    const mgr = createManager();
    expect(mgr.getCurrentMap()).toBe('');
  });

  it('getCurrentMissionNumber returns 0-based index', () => {
    const mgr = createManager();
    mgr.setCampaign('USA');
    expect(mgr.getCurrentMissionNumber()).toBe(0);
    mgr.gotoNextMission();
    expect(mgr.getCurrentMissionNumber()).toBe(1);
  });

  it('getCurrentMissionNumber returns -1 when no campaign', () => {
    const mgr = createManager();
    expect(mgr.getCurrentMissionNumber()).toBe(-1);
  });

  it('setCampaignAndMission sets specific mission', () => {
    const mgr = createManager();
    expect(mgr.setCampaignAndMission('USA', 'Mission02')).toBe(true);
    expect(mgr.getCurrentMission()!.name).toBe('mission02');
    expect(mgr.getCurrentMissionNumber()).toBe(1);
  });

  it('resolveMapAssetPath converts Windows path to asset path', () => {
    const mgr = createManager();
    mgr.setCampaign('USA');
    expect(mgr.resolveMapAssetPath()).toBe(
      'maps/_extracted/MapsZH/Maps/MD_USA01/MD_USA01.json',
    );
  });

  it('resolveMapAssetPath returns null when no mission', () => {
    const mgr = createManager();
    expect(mgr.resolveMapAssetPath()).toBeNull();
  });

  it('difficulty defaults to NORMAL', () => {
    const mgr = createManager();
    expect(mgr.difficulty).toBe('NORMAL');
  });

  it('difficulty can be set', () => {
    const mgr = createManager();
    mgr.difficulty = 'HARD';
    expect(mgr.difficulty).toBe('HARD');
  });

  it('getRankPoints always returns 0 per source parity', () => {
    const mgr = createManager();
    expect(mgr.getRankPoints()).toBe(0);
  });

  it('getStoryCampaigns returns USA, GLA, China', () => {
    const mgr = createManager();
    const stories = mgr.getStoryCampaigns();
    expect(stories.map(c => c.name).sort()).toEqual(['gla', 'usa']);
  });

  it('getChallengeCampaigns filters correctly', () => {
    const mgr = createManager();
    const challenges = mgr.getChallengeCampaigns();
    expect(challenges.length).toBe(1);
    expect(challenges[0]!.isChallengeCampaign).toBe(true);
  });

  it('getTrainingCampaign returns training', () => {
    const mgr = createManager();
    const training = mgr.getTrainingCampaign();
    expect(training).not.toBeNull();
    expect(training!.name).toBe('training');
  });

  it('filters retail story campaigns to usa, gla, and china only', () => {
    if (!fs.existsSync(RETAIL_CAMPAIGN_INI_PATH)) {
      return;
    }

    const mgr = new CampaignManager();
    mgr.init(fs.readFileSync(RETAIL_CAMPAIGN_INI_PATH, 'utf8'));

    expect(mgr.getStoryCampaigns().map((campaign) => campaign.name).sort()).toEqual([
      'china',
      'gla',
      'usa',
    ]);
  });

  it('certifies retail campaign missions resolve to shipped map assets and valid next-mission links', () => {
    if (!fs.existsSync(RETAIL_CAMPAIGN_INI_PATH) || !fs.existsSync(RETAIL_MANIFEST_PATH)) {
      return;
    }

    const campaigns = parseCampaignIni(fs.readFileSync(RETAIL_CAMPAIGN_INI_PATH, 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(RETAIL_MANIFEST_PATH, 'utf8')) as {
      entries: Array<{ outputPath: string }>;
    };
    const manifestOutputPaths = new Set(manifest.entries.map((entry) => entry.outputPath));

    expect(campaigns).toHaveLength(17);
    const missingMapAssets: Array<{ campaign: string; mission: string; mapPath: string }> = [];

    for (const campaign of campaigns) {
      expect(campaign.missions.length, `campaign "${campaign.name}" should contain missions`).toBeGreaterThan(0);
      expect(
        campaign.missions.some((mission) => mission.name === campaign.firstMission),
        `campaign "${campaign.name}" should resolve first mission "${campaign.firstMission}"`,
      ).toBe(true);

      const missionNames = new Set(campaign.missions.map((mission) => mission.name));
      for (const mission of campaign.missions) {
        const mapPath = resolveCampaignMapAssetPath(mission.mapName);
        expect(mapPath, `mission "${campaign.name}:${mission.name}" should resolve an asset path`).not.toBeNull();
        if (
          !campaign.name.endsWith('_demo')
          && (!manifestOutputPaths.has(mapPath!) || !fs.existsSync(path.join(RETAIL_ASSETS_ROOT, mapPath!)))
        ) {
          missingMapAssets.push({
            campaign: campaign.name,
            mission: mission.name,
            mapPath: mapPath!,
          });
        }

        if (mission.nextMission) {
          expect(
            missionNames.has(mission.nextMission),
            `mission "${campaign.name}:${mission.name}" should link to existing next mission "${mission.nextMission}"`,
          ).toBe(true);
        }
      }
    }

    expect(missingMapAssets).toEqual([
      {
        campaign: 'training',
        mission: 'mission01',
        mapPath: 'maps/_extracted/MapsZH/Maps/Training01/Training01.json',
      },
    ]);
  });

  it('certifies retail campaign display labels exist for non-demo missions', () => {
    if (!fs.existsSync(RETAIL_CAMPAIGN_INI_PATH) || !fs.existsSync(RETAIL_LOCALIZATION_PATH)) {
      return;
    }

    const campaigns = parseCampaignIni(fs.readFileSync(RETAIL_CAMPAIGN_INI_PATH, 'utf8'));
    const localizedEntries = (
      JSON.parse(fs.readFileSync(RETAIL_LOCALIZATION_PATH, 'utf8')) as {
        entries: Record<string, { text: string }>;
      }
    ).entries;

    const labels = new Set<string>();
    for (const campaign of campaigns) {
      if (campaign.name.endsWith('_demo')) {
        continue;
      }
      if (campaign.campaignNameLabel) {
        labels.add(campaign.campaignNameLabel);
      }
      for (const mission of campaign.missions) {
        if (mission.locationNameLabel) {
          labels.add(mission.locationNameLabel);
        }
        if (mission.generalName) {
          labels.add(mission.generalName);
        }
        for (const objectiveLine of mission.objectiveLines) {
          if (objectiveLine) {
            labels.add(objectiveLine);
          }
        }
        for (const unitName of mission.unitNames) {
          if (unitName) {
            labels.add(unitName);
          }
        }
      }
    }

    const missingLabels = [...labels].filter((label) => !(localizedEntries[label]?.text.length > 0));
    expect(missingLabels).toEqual([]);
  });
});
