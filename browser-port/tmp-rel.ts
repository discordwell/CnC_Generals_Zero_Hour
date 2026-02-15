import * as THREE from 'three';
import { GameLogicSubsystem } from './packages/game-logic/src/index.ts';

const scene = new THREE.Scene();
const gameLogic = new GameLogicSubsystem(scene);

gameLogic.setTeamRelationship('America', 'GDI', 2);
console.log('teamEntries', [...(gameLogic as any).teamRelationshipOverrides.entries()]);

const makeEntity = (side: string, id: number) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  mesh.position.set(5, 0, 5);
  return { id, templateName: `m${id}`, category: 'vehicle' as const, side, resolved: true, mesh, baseHeight: 0, nominalHeight:0, selected:false, canMove:true, crusherLevel:0, crushableLevel:0, canBeSquished:false, isUnmanned:false, locomotorSets:new Map(), locomotorUpgradeTriggers:new Set(), locomotorUpgradeEnabled:false, activeLocomotorSet:'SET_NORMAL', locomotorSurfaceMask:1, locomotorDownhillOnly:false, pathDiameter:1, blocksPath:true, obstacleGeometry:null, obstacleFootprint:0, ignoredMovementObstacleId:null, movePath:[], pathIndex:0, moving:false, speed:20, moveTarget:null};
};
const mover = makeEntity('America',1);
const ally = makeEntity('GDI',2);
(gameLogic as any).spawnedEntities.set(mover.id,mover);
(gameLogic as any).spawnedEntities.set(ally.id,ally);
console.log('relmap', (gameLogic as any).getTeamRelationship(mover, ally));
console.log('is ally in check?', (gameLogic as any).getTeamRelationshipBySides ? (gameLogic as any).getTeamRelationshipBySides(mover.side, ally.side):'n/a');
