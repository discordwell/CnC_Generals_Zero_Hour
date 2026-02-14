import * as THREE from 'three';
import { IniDataRegistry } from '@generals/ini-data';
import { HeightmapGrid, uint8ArrayToBase64 } from '@generals/terrain';
import { GameLogicSubsystem } from './packages/game-logic/src/index.js';

function canOccFactory(nav:any){
  const idx = (x:number,z:number)=>z*10+x;
  const profile = { canCrossWater:false, canCrossCliff:false, canCrossRubble:false, canPassObstacle:false, avoidPinched:true };
  return (x:number,z:number)=>{
    if (x<0||x>=10||z<0||z>=10) return false;
    const i=idx(x,z); const t=nav.terrainType[i]; const p=nav.pinched[i];
    if (t===4) return !!profile.canPassObstacle;
    if (t===1 && !profile.canCrossWater) return false;
    if (t===2 && profile.avoidPinched && p===1) return false;
    if (t===2 && !profile.canCrossCliff) return false;
    if (t===3 && !profile.canCrossRubble) return false;
    if (profile.avoidPinched && p===1) return false;
    return true;
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

const mapData = {
  heightmap: { width:10,height:10,borderSize:0,data:uint8ArrayToBase64(new Uint8Array(100).fill(64)) },
  objects: [
    { templateName:'Ranger', position:{x:15,y:15,z:0}, angle:0, flags:0, properties:{} },
    { templateName:'BlockerA', position:{x:30,y:10,z:0}, angle:0, flags:0, properties:{} },
    { templateName:'BlockerB', position:{x:0,y:30,z:0}, angle:0, flags:0, properties:{} },
  ],
  triggers: [], textureClasses: [], blendTileCount: 0,
};

const gl = new GameLogicSubsystem(new THREE.Scene());
gl.loadMapObjects(mapData, registry, HeightmapGrid.fromJSON(mapData.heightmap));
const nav = (gl as any).navigationGrid;
const canOcc = canOccFactory(nav);

const start={x:1,z:1}; const goal={x:4,z:4};
const queue:[[number, number][]] = [[start.x,start.z]] as any;
const seen = new Set<string>(['1,1']);
const parent = new Map<string,string | undefined>([['1,1', undefined]]);
const dx=[1,0,-1,0,1,-1,-1,1];
const dz=[0,1,0,-1,1,1,-1,-1];
while(queue.length){
  const next = queue.shift()!;
  const [x,z] = next;
  if (x===goal.x&&z===goal.z) break;
  for (let i=0;i<8;i++){
    const nx=x+dx[i], nz=z+dz[i];
    if (!canOcc(nx,nz)) continue;
    const isDiag = dx[i]!==0&&dz[i]!==0;
    if (isDiag && !(canOcc(x+dx[i], z) && canOcc(x, z+dz[i]))) continue;
    const key=`${nx},${nz}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parent.set(key, `${x},${z}`);
    queue.push([nx,nz]);
  }
}
console.log('seen goal', seen.has('4,4'), 'count', seen.size);
if (seen.has('4,4')) {
  let k:'string|undefined' = '4,4';
  const path:string[] = [];
  while(k){ path.push(k); k=parent.get(k); }
  console.log('path', path.reverse().join(' -> '));
}
