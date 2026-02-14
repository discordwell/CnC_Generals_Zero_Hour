import * as THREE from 'three';
import { IniDataRegistry } from '@generals/ini-data';
import { HeightmapGrid, uint8ArrayToBase64 } from '@generals/terrain';
import { GameLogicSubsystem } from './packages/game-logic/src/index.js';

const MAP = 10;

function makeMapData(objects: any[], width = MAP, height = MAP) {
  const data = uint8ArrayToBase64(new Uint8Array(width * height).fill(64));
  return {
    heightmap: { width, height, borderSize: 0, data },
    objects,
    triggers: [],
    textureClasses: [],
    blendTileCount: 0,
  };
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
if (!nav) throw new Error('no nav');

const profile = { canCrossWater: false, canCrossCliff: false, canCrossRubble: false, canPassObstacle: false, avoidPinched: true };
const idx = (x: number, z: number) => z * nav.width + x;
const canOccupy = (x: number, z: number) => {
  if (x < 0 || x >= nav.width || z < 0 || z >= nav.height) return false;
  const index = idx(x, z);
  const terrain = nav.terrainType[index];
  if (terrain === 4) return !!profile.canPassObstacle;
  if (terrain === 1 && !profile.canCrossWater) return false;
  if (terrain === 2 && profile.avoidPinched && nav.pinched[index] === 1) return false;
  if (terrain === 2 && !profile.canCrossCliff) return false;
  if (terrain === 3 && !profile.canCrossRubble) return false;
  if (profile.avoidPinched && nav.pinched[index] === 1) return false;
  return true;
};

const start = { x: 1, z: 1 };
const goal = { x: 4, z: 4 };
const queue = [start];
const visited = new Set([`${start.x},${start.z}`]);
const pred = new Map<string, string | null>();
pred.set(`${start.x},${start.z}`, null);
const dx = [1,0,-1,0,1,-1,-1,1];
const dz = [0,1,0,-1,1,1,-1,-1];

while (queue.length) {
  const cur = queue.shift()!;
  if (cur.x === goal.x && cur.z === goal.z) break;
  for (let i=0; i<8; i++) {
    const nx = cur.x + dx[i];
    const nz = cur.z + dz[i];
    if (!canOccupy(nx, nz)) continue;
    const isDiag = dx[i] !== 0 && dz[i] !== 0;
    if (isDiag) {
      if (!(canOccupy(cur.x + dx[i], cur.z) && canOccupy(cur.x, cur.z + dz[i]))) {
        continue;
      }
    }
    const key = `${nx},${nz}`;
    if (visited.has(key)) continue;
    visited.add(key);
    pred.set(key, `${cur.x},${cur.z}`);
    queue.push({ x: nx, z: nz });
  }
}

const goalKey = `${goal.x},${goal.z}`;
console.log('goal reachable?', visited.has(goalKey));
if (visited.has(goalKey)) {
  const path: {x:number;z:number}[] = [];
  let k: string | null = goalKey;
  while (k !== null) {
    const [x, z] = k.split(',').map(Number);
    path.push({ x, z });
    k = pred.get(k) ?? null;
  }
  path.reverse();
  console.log('bfs path len', path.length, path);
}
