/**
 * Top-level .map file parser.
 *
 * Reads the table of contents, then iterates through data chunks and
 * dispatches to the appropriate extractors based on chunk label.
 */

import { DataChunkReader, CHUNK_HEADER_SIZE } from './DataChunkReader.js';
import type { ChunkTableEntry, DataChunk } from './DataChunkReader.js';
import { HeightmapExtractor } from './HeightmapExtractor.js';
import type { HeightmapData } from './HeightmapExtractor.js';
import { MapObjectExtractor } from './MapObjectExtractor.js';
import type { MapObject } from './MapObjectExtractor.js';
import { WaypointExtractor } from './WaypointExtractor.js';
import type { PolygonTrigger, WaypointLink, WaypointNode } from './WaypointExtractor.js';
import { BlendTileExtractor } from './BlendTileExtractor.js';
import { SidesListExtractor } from './SidesListExtractor.js';
import type { MapSidesListJSON } from './SidesListExtractor.js';

/** Complete parsed representation of a .map file. */
export interface ParsedMap {
  /** Terrain heightmap data. */
  heightmap: HeightmapData;
  /** All placed objects. */
  objects: MapObject[];
  /** Polygon trigger regions. */
  triggers: PolygonTrigger[];
  /** Waypoint nodes and links. */
  waypoints: {
    nodes: WaypointNode[];
    links: WaypointLink[];
  };
  /** Total number of blend tiles. */
  blendTileCount: number;
  /** Texture class names used by the terrain. */
  textureClasses: string[];
  /** Optional packed cliff-state bits from BlendTileData (v7+). */
  cliffStateData: Uint8Array | null;
  /** Bytes per row for `cliffStateData`. */
  cliffStateStride: number;
  /** Optional SidesList payload containing sides, teams, and scripts. */
  sidesList?: MapSidesListJSON;
}

/** Chunk label constants. */
const CHUNK_HEIGHTMAP = 'HeightMapData';
const CHUNK_BLEND_TILE = 'BlendTileData';
const CHUNK_OBJECTS_LIST = 'ObjectsList';
const CHUNK_OBJECT = 'Object';
const CHUNK_POLYGON_TRIGGERS = 'PolygonTriggers';
const CHUNK_WAYPOINTS_LIST = 'WaypointsList';
const CHUNK_SIDES_LIST = 'SidesList';

export class MapParser {
  /**
   * Parse a complete .map file from an ArrayBuffer.
   *
   * Reads the TOC, then walks all data chunks, extracting heightmap,
   * objects, triggers, and blend tile data.
   */
  static parse(buffer: ArrayBuffer): ParsedMap {
    const reader = new DataChunkReader(buffer);
    const toc = reader.readTableOfContents();

    // Build ID-to-name lookup from TOC
    const idToName = new Map<number, string>();
    for (const entry of toc) {
      idToName.set(entry.id, entry.name);
    }

    let heightmap: HeightmapData | undefined;
    const objects: MapObject[] = [];
    const triggers: PolygonTrigger[] = [];
    const waypointLinks: WaypointLink[] = [];
    let blendTileCount = 0;
    const textureClasses: string[] = [];
    let cliffStateData: Uint8Array | null = null;
    let cliffStateStride = 0;
    let sidesList: MapSidesListJSON | undefined;

    // Walk all chunks until end of buffer
    while (reader.position < reader.byteLength) {
      // Safety: don't read past end
      if (reader.position + CHUNK_HEADER_SIZE > reader.byteLength) break;

      const chunk = reader.readChunkHeader();
      const chunkName = idToName.get(chunk.id);
      const chunkEnd = chunk.dataOffset + chunk.dataSize;

      switch (chunkName) {
        case CHUNK_HEIGHTMAP:
          heightmap = HeightmapExtractor.extract(reader, chunk.version);
          break;

        case CHUNK_BLEND_TILE: {
          if (!heightmap) {
            // BlendTileData v7+ cliff-state decoding depends on map dimensions.
            break;
          }
          const blendInfo = BlendTileExtractor.extract(
            reader,
            chunk.version,
            heightmap.width,
            heightmap.height,
          );
          blendTileCount = blendInfo.tileCount;
          for (const tc of blendInfo.textureClasses) {
            textureClasses.push(tc.name);
          }
          cliffStateData = blendInfo.cliffStateData;
          cliffStateStride = blendInfo.cliffStateStride;
          break;
        }

        case CHUNK_OBJECTS_LIST:
          // ObjectsList is a container; its child Object chunks follow
          // immediately inside its data range. We parse them inline.
          MapParser.parseObjectsList(reader, chunk, idToName, objects);
          break;

        case CHUNK_POLYGON_TRIGGERS: {
          const trigs = WaypointExtractor.extractTriggers(reader, chunk.version);
          triggers.push(...trigs);
          break;
        }

        case CHUNK_WAYPOINTS_LIST: {
          const links = WaypointExtractor.extractWaypointLinks(reader);
          waypointLinks.push(...links);
          break;
        }
        case CHUNK_SIDES_LIST:
          sidesList = SidesListExtractor.extract(reader, chunk, idToName);
          break;

        default:
          // Skip unknown chunks
          break;
      }

      // Ensure we advance past this chunk regardless of how much was read
      reader.seek(chunkEnd);
    }

    if (!heightmap) {
      throw new Error('Map file missing required HeightMapData chunk');
    }
    const waypointNodes = WaypointExtractor.extractWaypointNodes(objects, idToName);
    const waypointNodeMap = new Map<number, WaypointNode>(
      waypointNodes.map((node): [number, WaypointNode] => [node.id, node]),
    );
    const waypointLinksNormalized = WaypointExtractor.normalizeWaypointLinks(
      waypointLinks,
      waypointNodeMap,
    );

    return {
      heightmap,
      objects,
      triggers,
      waypoints: {
        nodes: waypointNodes,
        links: waypointLinksNormalized,
      },
      blendTileCount,
      textureClasses,
      cliffStateData,
      cliffStateStride,
      sidesList,
    };
  }

  /**
   * Parse child Object chunks within an ObjectsList container chunk.
   */
  private static parseObjectsList(
    reader: DataChunkReader,
    parentChunk: DataChunk,
    idToName: Map<number, string>,
    objects: MapObject[],
  ): void {
    const parentEnd = parentChunk.dataOffset + parentChunk.dataSize;

    while (reader.position < parentEnd) {
      if (reader.position + CHUNK_HEADER_SIZE > parentEnd) break;

      const childChunk = reader.readChunkHeader();
      const childName = idToName.get(childChunk.id);
      const childEnd = childChunk.dataOffset + childChunk.dataSize;

      if (childName === CHUNK_OBJECT) {
        const obj = MapObjectExtractor.extract(reader, childChunk.version, idToName);
        objects.push(obj);
      }

      reader.seek(childEnd);
    }
  }
}

export type { HeightmapData, MapObject, PolygonTrigger, WaypointNode, WaypointLink, ChunkTableEntry };
