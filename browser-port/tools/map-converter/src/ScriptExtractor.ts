/**
 * Extracts script data from map chunks (PlayerScriptsList / ScriptList / Script / ScriptGroup).
 *
 * Mirrors the C++ ScriptList::ParseScriptsDataChunk and Script::ParseScript paths.
 */

import type { DataChunk, DataChunkReader } from './DataChunkReader.js';
import { CHUNK_HEADER_SIZE } from './DataChunkReader.js';

export interface ScriptParameterJSON {
  type: number;
  intValue: number;
  realValue: number;
  stringValue: string;
  coord?: { x: number; y: number; z: number };
}

export interface ScriptConditionJSON {
  conditionType: number;
  params: ScriptParameterJSON[];
}

export interface ScriptActionJSON {
  actionType: number;
  params: ScriptParameterJSON[];
}

export interface ScriptOrConditionJSON {
  conditions: ScriptConditionJSON[];
}

export interface ScriptJSON {
  name: string;
  comment: string;
  conditionComment: string;
  actionComment: string;
  active: boolean;
  oneShot: boolean;
  easy: boolean;
  normal: boolean;
  hard: boolean;
  subroutine: boolean;
  delayEvaluationSeconds: number;
  conditions: ScriptOrConditionJSON[];
  actions: ScriptActionJSON[];
  falseActions: ScriptActionJSON[];
}

export interface ScriptGroupJSON {
  name: string;
  active: boolean;
  subroutine: boolean;
  scripts: ScriptJSON[];
}

export interface ScriptListJSON {
  scripts: ScriptJSON[];
  groups: ScriptGroupJSON[];
}

const CHUNK_SCRIPT_LIST = 'ScriptList';
const CHUNK_SCRIPT = 'Script';
const CHUNK_SCRIPT_GROUP = 'ScriptGroup';
const CHUNK_OR_CONDITION = 'OrCondition';
const CHUNK_CONDITION = 'Condition';
const CHUNK_SCRIPT_ACTION = 'ScriptAction';
const CHUNK_SCRIPT_ACTION_FALSE = 'ScriptActionFalse';

const PARAM_TYPE_COORD3D = 16; // Scripts.h Parameter::COORD3D

export class ScriptExtractor {
  static extractPlayerScriptLists(
    reader: DataChunkReader,
    chunk: DataChunk,
    idToName: ReadonlyMap<number, string>,
  ): ScriptListJSON[] {
    const lists: ScriptListJSON[] = [];
    const chunkEnd = chunk.dataOffset + chunk.dataSize;

    while (reader.position < chunkEnd) {
      if (reader.position + CHUNK_HEADER_SIZE > chunkEnd) {
        break;
      }
      const child = reader.readChunkHeader();
      const childName = idToName.get(child.id);
      const childEnd = child.dataOffset + child.dataSize;

      if (childName === CHUNK_SCRIPT_LIST) {
        lists.push(ScriptExtractor.extractScriptList(reader, child, idToName));
      }

      reader.seek(childEnd);
    }

    return lists;
  }

  private static extractScriptList(
    reader: DataChunkReader,
    chunk: DataChunk,
    idToName: ReadonlyMap<number, string>,
  ): ScriptListJSON {
    const scripts: ScriptJSON[] = [];
    const groups: ScriptGroupJSON[] = [];
    const chunkEnd = chunk.dataOffset + chunk.dataSize;

    while (reader.position < chunkEnd) {
      if (reader.position + CHUNK_HEADER_SIZE > chunkEnd) {
        break;
      }
      const child = reader.readChunkHeader();
      const childName = idToName.get(child.id);
      const childEnd = child.dataOffset + child.dataSize;

      if (childName === CHUNK_SCRIPT) {
        scripts.push(ScriptExtractor.extractScript(reader, child, idToName));
      } else if (childName === CHUNK_SCRIPT_GROUP) {
        groups.push(ScriptExtractor.extractScriptGroup(reader, child, idToName));
      }

      reader.seek(childEnd);
    }

    return { scripts, groups };
  }

  private static extractScriptGroup(
    reader: DataChunkReader,
    chunk: DataChunk,
    idToName: ReadonlyMap<number, string>,
  ): ScriptGroupJSON {
    const name = reader.readAsciiString();
    const active = reader.readUint8() !== 0;
    const subroutine = chunk.version >= 2 ? reader.readUint8() !== 0 : false;
    const scripts: ScriptJSON[] = [];

    const chunkEnd = chunk.dataOffset + chunk.dataSize;
    while (reader.position < chunkEnd) {
      if (reader.position + CHUNK_HEADER_SIZE > chunkEnd) {
        break;
      }
      const child = reader.readChunkHeader();
      const childName = idToName.get(child.id);
      const childEnd = child.dataOffset + child.dataSize;

      if (childName === CHUNK_SCRIPT) {
        scripts.push(ScriptExtractor.extractScript(reader, child, idToName));
      }

      reader.seek(childEnd);
    }

    return {
      name,
      active,
      subroutine,
      scripts,
    };
  }

  private static extractScript(
    reader: DataChunkReader,
    chunk: DataChunk,
    idToName: ReadonlyMap<number, string>,
  ): ScriptJSON {
    const name = reader.readAsciiString();
    const comment = reader.readAsciiString();
    const conditionComment = reader.readAsciiString();
    const actionComment = reader.readAsciiString();
    const active = reader.readUint8() !== 0;
    const oneShot = reader.readUint8() !== 0;
    const easy = reader.readUint8() !== 0;
    const normal = reader.readUint8() !== 0;
    const hard = reader.readUint8() !== 0;
    const subroutine = reader.readUint8() !== 0;
    const delayEvaluationSeconds = chunk.version >= 2 ? reader.readInt32() : 0;

    const conditions: ScriptOrConditionJSON[] = [];
    const actions: ScriptActionJSON[] = [];
    const falseActions: ScriptActionJSON[] = [];

    const chunkEnd = chunk.dataOffset + chunk.dataSize;
    while (reader.position < chunkEnd) {
      if (reader.position + CHUNK_HEADER_SIZE > chunkEnd) {
        break;
      }
      const child = reader.readChunkHeader();
      const childName = idToName.get(child.id);
      const childEnd = child.dataOffset + child.dataSize;

      if (childName === CHUNK_OR_CONDITION) {
        conditions.push(ScriptExtractor.extractOrCondition(reader, child, idToName));
      } else if (childName === CHUNK_SCRIPT_ACTION) {
        actions.push(ScriptExtractor.extractAction(reader, child));
      } else if (childName === CHUNK_SCRIPT_ACTION_FALSE) {
        falseActions.push(ScriptExtractor.extractAction(reader, child));
      }

      reader.seek(childEnd);
    }

    return {
      name,
      comment,
      conditionComment,
      actionComment,
      active,
      oneShot,
      easy,
      normal,
      hard,
      subroutine,
      delayEvaluationSeconds,
      conditions,
      actions,
      falseActions,
    };
  }

  private static extractOrCondition(
    reader: DataChunkReader,
    chunk: DataChunk,
    idToName: ReadonlyMap<number, string>,
  ): ScriptOrConditionJSON {
    const conditions: ScriptConditionJSON[] = [];
    const chunkEnd = chunk.dataOffset + chunk.dataSize;

    while (reader.position < chunkEnd) {
      if (reader.position + CHUNK_HEADER_SIZE > chunkEnd) {
        break;
      }
      const child = reader.readChunkHeader();
      const childName = idToName.get(child.id);
      const childEnd = child.dataOffset + child.dataSize;

      if (childName === CHUNK_CONDITION) {
        conditions.push(ScriptExtractor.extractCondition(reader));
      }

      reader.seek(childEnd);
    }

    return { conditions };
  }

  private static extractCondition(reader: DataChunkReader): ScriptConditionJSON {
    const conditionType = reader.readInt32();
    const paramCount = reader.readInt32();
    const params: ScriptParameterJSON[] = [];

    for (let i = 0; i < paramCount; i += 1) {
      params.push(ScriptExtractor.extractParameter(reader));
    }

    return { conditionType, params };
  }

  private static extractAction(reader: DataChunkReader, chunk?: DataChunk): ScriptActionJSON {
    void chunk;
    const actionType = reader.readInt32();
    const paramCount = reader.readInt32();
    const params: ScriptParameterJSON[] = [];

    for (let i = 0; i < paramCount; i += 1) {
      params.push(ScriptExtractor.extractParameter(reader));
    }

    return { actionType, params };
  }

  private static extractParameter(reader: DataChunkReader): ScriptParameterJSON {
    const type = reader.readInt32();
    if (type === PARAM_TYPE_COORD3D) {
      const x = reader.readFloat32();
      const y = reader.readFloat32();
      const z = reader.readFloat32();
      return {
        type,
        intValue: 0,
        realValue: 0,
        stringValue: '',
        coord: { x, y, z },
      };
    }

    const intValue = reader.readInt32();
    const realValue = reader.readFloat32();
    const stringValue = reader.readAsciiString();
    return {
      type,
      intValue,
      realValue,
      stringValue,
    };
  }
}
