import * as THREE from 'three';
import { IniDataRegistry } from '@generals/ini-data';
import { HeightmapGrid, uint8ArrayToBase64 } from '@generals/terrain';
import { GameLogicSubsystem } from './packages/game-logic/src/index.js';

const registry = new IniDataRegistry();
registry.loadBundle({
  objects: [
    { name: 'Ranger', side: 'America', kindOf: ['VEHICLE'], fields: {}, blocks: [], resolved: true },
    { name: 'BlockerA', side: 'America', kindOf: ['STRUCTURE'], fields: {}, blocks: [], resolved: true },
    { name: 'BlockerB', side: 'America', kindOf: ['STRUCTURE'], fields: {}, blocks: [], resolved: true },
  ],
  weapons: [], armors: [], upgrades: [], sciences: [], factions: [],
  stats: { objects: 3, weapons: 0, armors: 0, upgrades: 0, sciences: 0, factions: 0, unresolvedInheritance: 0, totalBlocks: 3 },
  errors: [],
  unsupportedBlockTypes: [],
});

const mapData = {
  heightmap: { width: 10, height: 10, borderSize: 0, data: uint8ArrayToBase64(new Uint8Array(100).fill(64)) },
  objects: [
    { templateName: 'Ranger', position: { x: 15, y: 15, z: 0 }, angle: 0, flags: 0, properties: {} },
    { templateName: 'BlockerA', position: { x: 30, y: 10, z: 0 }, angle: 0, flags: 0, properties: {} },
    { templateName: 'BlockerB', position: { x: 0, y: 30, z: 0 }, angle: 0, flags: 0, properties: {} },
  ],
  triggers: [],
  textureClasses: [],
  blendTileCount: 0,
};

const gl = new GameLogicSubsystem(new THREE.Scene());
gl.loadMapObjects(mapData, registry, HeightmapGrid.fromJSON(mapData.heightmap));
const nav = (gl as any).navigationGrid;
const idx = (x:number,z:number) => z*10+x;
const start = {x:Math.floor(15/10), z:Math.floor(15/10)};

const profile = { canCrossWater:false, canCrossCliff:false, canCrossRubble:false, canPassObstacle:false, avoidPinched:true };
const canOcc = (x:number,z:number)=>{
  if (x<0||x>=10||z<0||z>=10) return false;
  const t = nav.terrainType[idx(x,z)];
  const p = nav.pinched[idx(x,z)];
  if (t===4) return !!profile.canPassObstacle;
  if (t===1 && !profile.canCrossWater) return false;
  if (t===2 && profile.avoidPinched && p===1) return false;
  if (t===2 && !profile.canCrossCliff) return false;
  if (t===3 && !profile.canCrossRubble) return false;
  if (profile.avoidPinched && p===1) return false;
  return true;
};

console.log('start',start,'terrain',nav.terrainType[idx(start.x,start.z)],'blocked',nav.blocked[idx(start.x,start.z)],'pinched',nav.pinched[idx(start.x,start.z)]);

for (let z=-1;z<=1;z++){
  for (let x=-1;x<=1;x++){
    if (x===0&&z===0) continue;
    const nx=start.x+x, nz=start.z+z;
    console.log('neighbor',nx,nz,'occ?',canOcc(nx,nz),'terrain', nz>=0&&nz<10&&nx>=0&&nx<10?nav.terrainType[idx(nx,nz)]: 'out','pin', nz>=0&&nz<10&&nx>=0&&nx<10?nav.pinched[idx(nx,nz)]:'o');
    if (x!==0&&z!==0){
      console.log('  diagOrth1',canOcc(start.x+x,start.z), 'diagOrth2',canOcc(start.x,start.z+z));
    }
  }
}
