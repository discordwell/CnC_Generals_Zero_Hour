import * as THREE from 'three';
import { IniDataRegistry } from '@generals/ini-data';
import { HeightmapGrid, uint8ArrayToBase64 } from '@generals/terrain';
import { GameLogicSubsystem } from './packages/game-logic/src/index.js';

function makeMapData(objects: any[], width = 10, height = 10) {
  const data = uint8ArrayToBase64(new Uint8Array(width * height).fill(64));
  return { heightmap: { width, height, borderSize: 0, data }, objects, triggers: [], textureClasses: [], blendTileCount: 0 };
}

const registry = new IniDataRegistry();
registry.loadBundle({
  objects: [
    { name: 'Ranger', side: 'America', kindOf: ['VEHICLE'], fields: {}, blocks: [], resolved: true },
    { name: 'BlockerA', side: 'America', kindOf: ['STRUCTURE'], fields: {}, blocks: [], resolved: true },
    { name: 'BlockerB', side: 'America', kindOf: ['STRUCTURE'], fields: {}, blocks: [], resolved: true },
  ],
  weapons: [], armors: [], upgrades: [], sciences: [], factions: [],
  stats: { objects: 3, weapons: 0, armors: 0, upgrades: 0, sciences: 0, factions: 0, unresolvedInheritance: 0, totalBlocks: 3 },
  errors: [], unsupportedBlockTypes: [],
});

const mapData = makeMapData([
  { templateName: 'Ranger', position: { x: 15, y: 15, z: 0 }, angle: 0, flags: 0, properties: {} },
  { templateName: 'BlockerA', position: { x: 30, y: 10, z: 0 }, angle: 0, flags: 0, properties: {} },
  { templateName: 'BlockerB', position: { x: 10, y: 30, z: 0 }, angle: 0, flags: 0, properties: {} },
]);

const gameLogic = new GameLogicSubsystem(new THREE.Scene());
gameLogic.loadMapObjects(mapData, registry, HeightmapGrid.fromJSON(mapData.heightmap));
const nav = (gameLogic as any).navigationGrid;
if (!nav) throw new Error('missing nav');

for (let z=0; z<10; z++) {
  let row = '';
  let pRow = '';
  for (let x=0; x<10; x++) {
    const v = nav.terrainType[z*10+x];
    const b = nav.blocked[z*10+x];
    const p = nav.pinched[z*10+x];
    const c = v === 4 ? 'X' : (p === 1 ? 'P' : '.' );
    row += c;
    pRow += p === 1 ? 'P' : '.';
  }
  console.log('z', z, row, ' ', pRow);
}
