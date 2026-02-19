/**
 * Extracts polygon trigger data from the PolygonTriggers chunk.
 *
 * PolygonTriggers chunk versions 1-3:
 *   int32  triggerCount
 *   for each trigger:
 *     string  name         (uint16 len + chars)
 *     int32   id
 *     uint8   isWaterArea  (v2+)
 *     uint8   isRiver      (v3+)
 *     int32   riverStart   (v3+, index into polygon points for river start)
 *     int32   pointCount
 *     for each point:
 *       int32 x, y, z
 */

import type { DataChunkReader } from './DataChunkReader.js';
import type { MapObject } from './MapObjectExtractor.js';

/** A polygon trigger region from the map. */
export interface PolygonTrigger {
  /** Trigger name (e.g. "PlayerStart_0"). */
  name: string;
  /** Unique numeric identifier. */
  id: number;
  /** Whether this trigger defines a water area (v2+). */
  isWaterArea: boolean;
  /** Whether this trigger defines a river (v3+). */
  isRiver: boolean;
  /** Array of polygon vertices. */
  points: Array<{ x: number; y: number; z: number }>;
}

/** A waypoint node extracted from map object dict fields. */
export interface WaypointNode {
  id: number;
  name: string;
  position: { x: number; y: number; z: number };
  pathLabel1?: string;
  pathLabel2?: string;
  pathLabel3?: string;
  biDirectional: boolean;
}

/** A directed waypoint link from the WaypointsList chunk. */
export interface WaypointLink {
  waypoint1: number;
  waypoint2: number;
}

/** Normalized directed waypoint link with explicit source and destination node IDs. */
export interface ValidatedWaypointLink extends WaypointLink {}

export class WaypointExtractor {
  /**
   * Extract all polygon triggers from a PolygonTriggers chunk.
   * The reader must be positioned at the start of the chunk's data payload.
   */
  static extractTriggers(reader: DataChunkReader, version: number): PolygonTrigger[] {
    const triggerCount = reader.readInt32();
    const triggers: PolygonTrigger[] = [];

    for (let i = 0; i < triggerCount; i++) {
      const name = reader.readAsciiString();
      const id = reader.readInt32();

      let isWaterArea = false;
      if (version >= 2) {
        isWaterArea = reader.readUint8() !== 0;
      }

      let isRiver = false;
      if (version >= 3) {
        isRiver = reader.readUint8() !== 0;
        // riverStart index — we read it but don't expose it in the interface
        reader.readInt32();
      }

      const pointCount = reader.readInt32();
      const points: Array<{ x: number; y: number; z: number }> = [];

      for (let p = 0; p < pointCount; p++) {
        const x = reader.readInt32();
        const y = reader.readInt32();
        const z = reader.readInt32();
        points.push({ x, y, z });
      }

      triggers.push({ name, id, isWaterArea, isRiver, points });
    }

    return triggers;
  }

  /**
   * Extract waypoint links from the WaypointsList chunk.
   *
   * WaypointsList v1:
   *   int32  numWaypointLinks
   *   for each link:
   *     int32 waypoint1
   *     int32 waypoint2
   */
  static extractWaypointLinks(reader: DataChunkReader): WaypointLink[] {
    const linkCount = reader.readInt32();
    const links: WaypointLink[] = [];
    for (let i = 0; i < linkCount; i++) {
      links.push({
        waypoint1: reader.readInt32(),
        waypoint2: reader.readInt32(),
      });
    }
    return links;
  }

  /**
   * Validate waypoint links against available nodes and materialize source-driven
   * directionality exactly as the source game logic does:
   * - discard links whose endpoints are missing or self-loops
   * - skip duplicate links while preserving source chunk order
   * - add reverse links when the source waypoint is bi-directional
   */
  static normalizeWaypointLinks(
    links: Iterable<WaypointLink>,
    nodesById: ReadonlyMap<number, WaypointNode>,
  ): ValidatedWaypointLink[] {
    const normalized: ValidatedWaypointLink[] = [];
    const seen = new Set<string>();

    const addIfMissing = (waypoint1: number, waypoint2: number): void => {
      const key = `${waypoint1}->${waypoint2}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      normalized.push({ waypoint1, waypoint2 });
    };

    for (const link of links) {
      const sourceId = Math.trunc(link.waypoint1);
      const targetId = Math.trunc(link.waypoint2);

      if (sourceId === targetId) {
        continue;
      }

      const sourceNode = nodesById.get(sourceId);
      const targetNode = nodesById.get(targetId);

      if (!sourceNode || !targetNode) {
        continue;
      }

      addIfMissing(sourceId, targetId);

      if (sourceNode.biDirectional) {
        addIfMissing(targetId, sourceId);
      }
    }

    return normalized;
  }

  /**
   * Extract waypoint nodes from map objects by decoding dict key IDs through TOC names.
   */
  static extractWaypointNodes(
    objects: readonly MapObject[],
    idToName: ReadonlyMap<number, string>,
  ): WaypointNode[] {
    const nodes: WaypointNode[] = [];
    for (const obj of objects) {
      const id = WaypointExtractor.readNumericProperty(obj, idToName, 'waypointID');
      const name = WaypointExtractor.readStringProperty(obj, idToName, 'waypointName');
      if (id === null || !name) {
        continue;
      }

      const pathLabel1 = WaypointExtractor.readLooseStringProperty(obj, idToName, 'waypointPathLabel1');
      const pathLabel2 = WaypointExtractor.readLooseStringProperty(obj, idToName, 'waypointPathLabel2');
      const pathLabel3 = WaypointExtractor.readLooseStringProperty(obj, idToName, 'waypointPathLabel3');
      const biDirectional = WaypointExtractor.readBooleanProperty(obj, idToName, 'waypointPathBiDirectional') ?? false;

      nodes.push({
        id,
        name,
        position: { ...obj.position },
        pathLabel1: pathLabel1 || undefined,
        pathLabel2: pathLabel2 || undefined,
        pathLabel3: pathLabel3 || undefined,
        biDirectional,
      });
    }

    nodes.sort((left, right) => left.id - right.id);
    return nodes;
  }

  private static readProperty(
    obj: MapObject,
    idToName: ReadonlyMap<number, string>,
    propertyName: string,
  ): unknown {
    const normalizedPropertyName = propertyName.trim().toLowerCase();
    for (const [key, value] of obj.properties) {
      const resolvedName = idToName.get(key);
      if (!resolvedName) {
        continue;
      }
      if (resolvedName.trim().toLowerCase() === normalizedPropertyName) {
        return value;
      }
    }
    return undefined;
  }

  private static readNumericProperty(
    obj: MapObject,
    idToName: ReadonlyMap<number, string>,
    propertyName: string,
  ): number | null {
    const value = WaypointExtractor.readProperty(obj, idToName, propertyName);
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value);
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return Math.trunc(parsed);
      }
    }
    return null;
  }

  private static readStringProperty(
    obj: MapObject,
    idToName: ReadonlyMap<number, string>,
    propertyName: string,
  ): string | null {
    const value = WaypointExtractor.readProperty(obj, idToName, propertyName);
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private static readLooseStringProperty(
    obj: MapObject,
    idToName: ReadonlyMap<number, string>,
    propertyName: string,
  ): string | null {
    const value = WaypointExtractor.readProperty(obj, idToName, propertyName);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(Math.trunc(value));
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    return null;
  }

  private static readBooleanProperty(
    obj: MapObject,
    idToName: ReadonlyMap<number, string>,
    propertyName: string,
  ): boolean | null {
    const value = WaypointExtractor.readProperty(obj, idToName, propertyName);
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === 'yes' || normalized === '1') {
        return true;
      }
      if (normalized === 'false' || normalized === 'no' || normalized === '0') {
        return false;
      }
    }
    return null;
  }
}
