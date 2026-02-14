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
  errors: [], unsupportedBlockTypes: [],
});

const data = uint8ArrayToBase64(new Uint8Array(10 * 10).fill(64));
const mapData = { heightmap: { width: 10, height: 10, borderSize: 0, data }, objects: [
  { templateName: 'Ranger', position: { x: 15, y: 15, z: 0 }, angle: 0, flags: 0, properties: {} },
  { templateName: 'BlockerA', position: { x: 30, y: 10, z: 0 }, angle: 0, flags: 0, properties: {} },
  { templateName: 'BlockerB', position: { x: 10, y: 30, z: 0 }, angle: 0, flags: 0, properties: {} },
] };

const gameLogic = new GameLogicSubsystem(new THREE.Scene());
gameLogic.loadMapObjects(mapData as any, registry, HeightmapGrid.fromJSON(mapData.heightmap));
const gl = gameLogic as any;
const nav = gl.navigationGrid;
if (!nav) throw new Error('no nav');
const idx = (x,z)=>z*nav.width+x;
for (let z=0; z<10; z++) {
  let chars='';
  for (let x=0; x<10; x++) {
    const t=nav.terrainType[idx(x,z)];
    const blocked = nav.blocked[idx(x,z)]===1;
    chars += blocked ? 'X' : '.';
  }
  console.log(z, chars);
}

const profile = { canCrossWater:false, canCrossCliff:false, canCrossRubble:false, canPassObstacle:false, avoidPinched:true};
const canOcc=(x,z)=>{
  if (x<0||x>=10||z<0||z>=10) return false;
  const i=idx(x,z);
  const t=nav.terrainType[i];
  if (t===4) return false;
  if (t===1) return false;
  if (t===2 && profile.avoidPinched && nav.pinched[i]) return false;
  if (t===2 && !profile.canCrossCliff) return false;
  if (t===3 && !profile.canCrossRubble) return false;
  if (profile.avoidPinched && nav.pinched[i]) return false;
  return true;
};

const queue=[[1,1]]; const seen=new Set(['1,1']);
const parent=new Map(); parent.set('1,1', null);
const dx=[1,0,-1,0,1,-1,-1,1];
const dz=[0,1,0,-1,1,1,-1,-1];
while(queue.length){
  const [x,z]=queue.shift();
  console.log('visit',x,z);
  if (x===4&&z===4){break;}
  for(let i=0;i<8;i++){
    const nx=x+dx[i], nz=z+dz[i];
    const isDiag=dx[i]!==0&&dz[i]!==0;
    if (isDiag && !(canOcc(x+dx[i],z)&&canOcc(x,z+dz[i]))) continue;
    if (!canOcc(nx,nz)) continue;
    const key=`${nx},${nz}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parent.set(key, `${x},${z}`);
    queue.push([nx,nz]);
  }
}
console.log('goal?', seen.has('4,4'),'seen',seen.size);
