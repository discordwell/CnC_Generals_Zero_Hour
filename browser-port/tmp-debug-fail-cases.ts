import * as THREE from 'three';
import { IniDataRegistry, type IniDataBundle } from './packages/ini-data/src/index.js';
import { GameLogicSubsystem } from './packages/game-logic/src/index.js';
import { HeightmapGrid } from './packages/terrain/src/index.js';

const LOCOMOTORSURFACE_GROUND = 1 << 0;
const LOCOMOTORSURFACE_AIR = 1 << 1;

const bundle: IniDataBundle = {
  locomotors: [
    { name: 'TestGround', fields: { Surfaces: ['GROUND'] }, surfaces: ['GROUND'], surfaceMask: LOCOMOTORSURFACE_GROUND, downhillOnly: false },
    { name: 'TestAir', fields: { Surfaces: ['AIR'] }, surfaces: ['AIR'], surfaceMask: LOCOMOTORSURFACE_AIR, downhillOnly: false },
  ],
  objects: [
    {
      name: 'Ranger', side: 'America', kindOf: ['VEHICLE'], fields: {}, blocks: [{ type: 'Behavior', name: 'AIUpdateInterface ModuleTag_AI', fields: { LocomotorSet: ['SET_NORMAL TestGround'] }, blocks: [] }], resolved: true,
    },
    { name: 'Wall', side: 'America', kindOf: ['STRUCTURE'], fields: {}, blocks: [], resolved: true },
  ],
  weapons: [], armors: [], upgrades: [], sciences: [], factions: [],
  stats: { objects: 2, weapons: 0, armors: 0, upgrades: 0, sciences: 0, factions: 0, unresolvedInheritance: 0, totalBlocks: 0 },
  errors: [], unsupportedBlockTypes: [],
};

function makeMap() {
  return {
    heightmap: { width: 10, height: 10, borderSize: 0, data: Buffer.from(new Uint8Array(100).fill(64)).toString('base64') },
    objects: [
      { templateName: 'Ranger', position: { x: 5, y: 10, z: 0 }, angle: 0, flags: 0, properties: {} },
      { templateName: 'Wall', position: { x: 40, y: 10, z: 0 }, angle: 0, flags: 0, properties: {} },
    ],
    triggers: [],
    textureClasses: [],
    blendTileCount: 0,
  };
}

const registry = new IniDataRegistry();
registry.loadBundle(bundle);
const map = makeMap();
const logic = new GameLogicSubsystem(new THREE.Scene());
logic.loadMapObjects(map as any, registry, HeightmapGrid.fromJSON(map.heightmap));
const nav = (logic as any).navigationGrid;
console.log('terrain lines');
for(let z=0;z<nav.height;z++){
  let t='',b='',p='';
  for(let x=0;x<nav.width;x++){
    const i=z*nav.width+x;
    t += nav.terrainType[i];
    b += nav.blocked[i] ? '#' : '.';
    p += nav.pinched[i] ? '*' : '.';
  }
  console.log(z,t,b,p);
}
const profileGround = { acceptableSurfaces: LOCOMOTORSURFACE_GROUND, canPassObstacle: false, canUseBridge: true };
const profileAir = { acceptableSurfaces: LOCOMOTORSURFACE_AIR, canPassObstacle: true, canUseBridge: true };
for (const [name, prof] of Object.entries({ground:profileGround,air:profileAir}) as any) {
  const s = (logic as any).canOccupyCell(0,1,prof,nav);
  const g = (logic as any).canOccupyCell(4,1,prof,nav);
  const t = (logic as any).canOccupyCell(8,1,prof,nav);
  console.log(name, 'canOccupy', s,g,t);
  console.log(name, 'findNearestStart', (logic as any).findNearestPassableCell(0,1,nav,prof));
  console.log(name, 'findNearestGoal', (logic as any).findNearestPassableCell(8,1,nav,prof));
}

const p = (logic as any).findPath(5,10,85,10,{ locomotorSurfaceMask: LOCOMOTORSURFACE_GROUND } as never);
const p2= (logic as any).findPath(5,10,85,10,{ locomotorSurfaceMask: LOCOMOTORSURFACE_AIR } as never);
console.log('paths', p.length, p2.length);
console.log(p,p2);
