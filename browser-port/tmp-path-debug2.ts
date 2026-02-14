import * as THREE from 'three';
import { IniDataRegistry } from '@generals/ini-data';
import { HeightmapGrid, uint8ArrayToBase64 } from '@generals/terrain';
import { GameLogicSubsystem } from './packages/game-logic/src/index.js';

function makeMapDataObjectCount(objects: any[], width = 10, height = 10) {
  const data = uint8ArrayToBase64(new Uint8Array(width * height).fill(64));
  return {
    heightmap: { width, height, borderSize: 0, data },
    objects,
    triggers: [],
    textureClasses: [],
    blendTileCount: 0,
  };
}

const scene = new THREE.Scene();
const registry = new IniDataRegistry();
registry.loadBundle({
  objects: [
    { name: 'Ranger', side: 'America', kindOf: ['VEHICLE'], fields: {}, blocks: [], resolved: true },
    { name: 'BlockerA', side: 'America', kindOf: ['STRUCTURE'], fields: {}, blocks: [], resolved: true },
    { name: 'BlockerB', side: 'America', kindOf: ['STRUCTURE'], fields: {}, blocks: [], resolved: true },
  ],
  weapons: [],
  armors: [],
  upgrades: [],
  sciences: [],
  factions: [],
  stats: { objects: 3, weapons: 0, arms: 0 },
  errors: [],
  unsupportedBlockTypes: [],
});

