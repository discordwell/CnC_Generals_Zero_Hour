/**
 * ChallengeGenerals — Tracks Generals Challenge progression and personas.
 *
 * Source parity:
 *   GeneralsMD/Code/GameEngine/Include/GameClient/ChallengeGenerals.h
 *   GeneralsMD/Code/GameEngine/Source/GameClient/ChallengeGenerals.cpp
 *
 * Persists defeated generals to localStorage so progress carries across sessions.
 */

export const NUM_GENERALS = 9;

export interface GeneralPersona {
  index: number;
  name: string;
  faction: string;
  campaignName: string;
  playerTemplateName: string;
  portraitMovieLeftName: string;
  portraitMovieRightName: string;
  selectionSound: string;
  tauntSounds: string[];
  winSound: string;
  lossSound: string;
}

/** Single source of truth for general persona data. */
export const DEFAULT_PERSONAS: readonly GeneralPersona[] = [
  { index: 0, name: 'General Granger', faction: 'USA Air Force', campaignName: 'challenge_0', playerTemplateName: 'FactionAmericaAirForceGeneral', portraitMovieLeftName: 'PortraitAirGenLeft', portraitMovieRightName: 'PortraitAirGenRight', selectionSound: '', tauntSounds: [], winSound: '', lossSound: '' },
  { index: 1, name: 'Dr. Thrax', faction: 'GLA Toxin', campaignName: 'challenge_1', playerTemplateName: 'FactionGLAToxinGeneral', portraitMovieLeftName: 'PortraitDrThraxLeft', portraitMovieRightName: 'PortraitDrThraxRight', selectionSound: '', tauntSounds: [], winSound: '', lossSound: '' },
  { index: 2, name: 'General Tao', faction: 'China Nuclear', campaignName: 'challenge_2', playerTemplateName: 'FactionChinaNukeGeneral', portraitMovieLeftName: 'PortraitNukeGenLeft', portraitMovieRightName: 'PortraitNukeGenRight', selectionSound: '', tauntSounds: [], winSound: '', lossSound: '' },
  { index: 3, name: 'General Alexander', faction: 'USA Super Weapons', campaignName: 'challenge_3', playerTemplateName: 'FactionAmericaSuperWeaponGeneral', portraitMovieLeftName: 'PortraitSuperGenLeft', portraitMovieRightName: 'PortraitSuperGenRight', selectionSound: '', tauntSounds: [], winSound: '', lossSound: '' },
  { index: 4, name: 'General Kwai', faction: 'China Tank', campaignName: 'challenge_4', playerTemplateName: 'FactionChinaTankGeneral', portraitMovieLeftName: 'PortraitTankGenLeft', portraitMovieRightName: 'PortraitTankGenRight', selectionSound: '', tauntSounds: [], winSound: '', lossSound: '' },
  { index: 5, name: 'General Townes', faction: 'USA Laser', campaignName: 'challenge_5', playerTemplateName: 'FactionAmericaLaserGeneral', portraitMovieLeftName: 'PortraitLaserGenLeft', portraitMovieRightName: 'PortraitLaserGenRight', selectionSound: '', tauntSounds: [], winSound: '', lossSound: '' },
  { index: 6, name: 'Prince Kassad', faction: 'GLA Stealth', campaignName: 'challenge_6', playerTemplateName: 'FactionGLAStealthGeneral', portraitMovieLeftName: 'PortraitStealthGenLeft', portraitMovieRightName: 'PortraitStealthGenRight', selectionSound: '', tauntSounds: [], winSound: '', lossSound: '' },
  { index: 7, name: 'General Fai', faction: 'China Infantry', campaignName: 'challenge_7', playerTemplateName: 'FactionChinaInfantryGeneral', portraitMovieLeftName: 'PortraitInfantryGenLeft', portraitMovieRightName: 'PortraitInfantryGenRight', selectionSound: '', tauntSounds: [], winSound: '', lossSound: '' },
  { index: 8, name: 'General Leang', faction: 'Boss General', campaignName: 'challenge_8', playerTemplateName: 'FactionBossGeneral', portraitMovieLeftName: 'PortraitBossGenLeft', portraitMovieRightName: 'PortraitBossGenRight', selectionSound: '', tauntSounds: [], winSound: '', lossSound: '' },
];

const STORAGE_KEY = 'generals_challenge_progress';

export class ChallengeGenerals {
  private personas: GeneralPersona[] = [...DEFAULT_PERSONAS];
  private defeatedIndices = new Set<number>();
  private currentPlayerTemplateNum = 0;
  private storage: Storage | null = null;

  constructor(storage?: Storage | null) {
    this.storage = storage ?? null;
    this.loadProgress();
  }

  getPersonas(): readonly GeneralPersona[] {
    return this.personas;
  }

  getPersona(index: number): GeneralPersona | null {
    return this.personas[index] ?? null;
  }

  getPersonaByCampaignName(name: string): GeneralPersona | null {
    return this.personas.find(p => p.campaignName === name.toLowerCase()) ?? null;
  }

  getPersonaByTemplateName(name: string): GeneralPersona | null {
    return this.personas.find(p => p.playerTemplateName === name) ?? null;
  }

  isDefeated(index: number): boolean {
    return this.defeatedIndices.has(index);
  }

  getDefeatedIndices(): readonly number[] {
    return [...this.defeatedIndices];
  }

  markDefeated(index: number): void {
    this.defeatedIndices.add(index);
    this.saveProgress();
  }

  resetProgress(): void {
    this.defeatedIndices.clear();
    this.saveProgress();
  }

  get currentPlayerTemplate(): number {
    return this.currentPlayerTemplateNum;
  }

  set currentPlayerTemplate(num: number) {
    this.currentPlayerTemplateNum = num;
  }

  private loadProgress(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data.defeated)) {
          for (const idx of data.defeated) {
            if (typeof idx === 'number' && idx >= 0 && idx < NUM_GENERALS) {
              this.defeatedIndices.add(idx);
            }
          }
        }
      }
    } catch {
      // Ignore corrupt data
    }
  }

  private saveProgress(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(
        STORAGE_KEY,
        JSON.stringify({ defeated: [...this.defeatedIndices] }),
      );
    } catch {
      // Storage may be full or unavailable
    }
  }
}
