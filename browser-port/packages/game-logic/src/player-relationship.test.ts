import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { GameLogicSubsystem } from './index.js';

describe('GameLogicSubsystem player relationship routing', () => {
  it('treats the same player index as allies', () => {
    const gameLogic = new GameLogicSubsystem(new THREE.Scene());
    expect(gameLogic.getPlayerRelationshipByIndex(3, 3)).toBe('allies');
  });

  it('returns neutral for different players when side mapping is missing', () => {
    const gameLogic = new GameLogicSubsystem(new THREE.Scene());
    expect(gameLogic.getPlayerRelationshipByIndex(1, 2)).toBe('neutral');
  });

  it('resolves relationship from side mapping and team override data', () => {
    const gameLogic = new GameLogicSubsystem(new THREE.Scene());
    gameLogic.setPlayerSide(1, 'America');
    gameLogic.setPlayerSide(2, 'China');

    expect(gameLogic.getPlayerRelationshipByIndex(1, 2)).toBe('neutral');

    gameLogic.setTeamRelationship('America', 'China', 0);
    expect(gameLogic.getPlayerRelationshipByIndex(1, 2)).toBe('enemies');
    expect(gameLogic.getPlayerRelationshipByIndex(2, 1)).toBe('neutral');
  });

  it('falls back to neutral when a player side mapping is cleared', () => {
    const gameLogic = new GameLogicSubsystem(new THREE.Scene());
    gameLogic.setPlayerSide(1, 'America');
    gameLogic.setPlayerSide(2, 'America');
    expect(gameLogic.getPlayerRelationshipByIndex(1, 2)).toBe('allies');

    gameLogic.setPlayerSide(2, null);
    expect(gameLogic.getPlayerRelationshipByIndex(1, 2)).toBe('neutral');
  });
});
