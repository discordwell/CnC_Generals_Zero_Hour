import type { HeightmapGrid } from '@generals/terrain';

interface UnitCreatePoint {
  x: number;
  y: number;
  z: number;
}

interface NaturalRallyPoint {
  x: number;
  y: number;
  z: number;
}

interface QueueProductionExitProfileLike {
  moduleType: 'QUEUE' | 'SUPPLY_CENTER' | 'SPAWN_POINT';
  unitCreatePoint: UnitCreatePoint;
  naturalRallyPoint: NaturalRallyPoint | null;
  allowAirborneCreation: boolean;
}

interface ProducerForSpawnResolution {
  x: number;
  z: number;
  y: number;
  rotationY: number;
  baseHeight: number;
  rallyPoint: { x: number; z: number } | null;
  queueProductionExitProfile: QueueProductionExitProfileLike | null;
}

interface ProducerForQueueExitGateTick {
  queueProductionExitProfile: QueueProductionExitProfileLike | null;
  queueProductionExitBurstRemaining: number;
  queueProductionExitDelayFramesRemaining: number;
}

export function tickQueueExitGate(producer: ProducerForQueueExitGateTick): void {
  if (!producer.queueProductionExitProfile) {
    return;
  }

  const isFreeToExit = producer.queueProductionExitBurstRemaining > 0
    || producer.queueProductionExitDelayFramesRemaining === 0;
  if (isFreeToExit) {
    producer.queueProductionExitDelayFramesRemaining = 0;
    return;
  }

  producer.queueProductionExitDelayFramesRemaining = Math.max(
    0,
    producer.queueProductionExitDelayFramesRemaining - 1,
  );
}

export function resolveQueueSpawnLocation(
  producer: ProducerForSpawnResolution,
  mapHeightmap: HeightmapGrid | null,
): {
  x: number;
  z: number;
  heightOffset: number;
} | null {
  const exitProfile = producer.queueProductionExitProfile;
  if (!exitProfile) {
    return null;
  }

  const yaw = producer.rotationY;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const local = exitProfile.unitCreatePoint;
  const x = producer.x + (local.x * cos - local.y * sin);
  const z = producer.z + (local.x * sin + local.y * cos);
  const terrainHeight = mapHeightmap ? mapHeightmap.getInterpolatedHeight(x, z) : 0;
  const producerBaseY = producer.y - producer.baseHeight;
  let worldY = producerBaseY + local.z;
  const creationInAir = Math.abs(worldY - terrainHeight) > 0.0001;
  if (creationInAir && !exitProfile.allowAirborneCreation) {
    worldY = terrainHeight;
  }

  return {
    x,
    z,
    heightOffset: worldY - terrainHeight,
  };
}

export function resolveQueueProductionNaturalRallyPoint(
  producer: ProducerForSpawnResolution,
  producedUnitCanMove: boolean,
  mapXyFactor: number,
): { x: number; z: number } | null {
  if (!producedUnitCanMove) {
    return null;
  }

  if (producer.rallyPoint) {
    return {
      x: producer.rallyPoint.x,
      z: producer.rallyPoint.z,
    };
  }

  const exitProfile = producer.queueProductionExitProfile;
  if (!exitProfile || !exitProfile.naturalRallyPoint) {
    return null;
  }

  const rallyPoint = { ...exitProfile.naturalRallyPoint };
  if (exitProfile.moduleType === 'QUEUE') {
    const magnitude = Math.hypot(rallyPoint.x, rallyPoint.y, rallyPoint.z);
    if (magnitude > 0) {
      const offsetScale = (2 * mapXyFactor) / magnitude;
      rallyPoint.x += rallyPoint.x * offsetScale;
      rallyPoint.y += rallyPoint.y * offsetScale;
      rallyPoint.z += rallyPoint.z * offsetScale;
    }
  }

  const yaw = producer.rotationY;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    x: producer.x + (rallyPoint.x * cos - rallyPoint.y * sin),
    z: producer.z + (rallyPoint.x * sin + rallyPoint.y * cos),
  };
}
