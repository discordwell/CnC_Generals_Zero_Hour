/**
 * INI file parser — ported from Generals INI system.
 *
 * Parses the Generals INI format which uses block structure:
 *
 *   Object USATankCrusader
 *     Side = America
 *     Body = ActiveBody ModuleTag_02
 *       MaxHealth = 300.0
 *     End
 *   End
 *
 * Supports:
 *   - #include directive resolution (via callback)
 *   - #define macro substitution
 *   - Inheritance (Object Foo : Bar)
 *   - Singleton blocks (GameData, MiscAudio — no name)
 *   - AddModule / RemoveModule / ReplaceModule (child objects)
 *   - += additive field operator
 *   - Deterministic output ordering
 */

export interface IniBlock {
  type: string;
  name: string;
  parent?: string;
  fields: Record<string, IniValue>;
  blocks: IniBlock[];
}

export type IniValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | IniValue[];

export interface IniParseResult {
  blocks: IniBlock[];
  errors: IniParseError[];
  includes: string[];
  defines: Map<string, string>;
}

export interface IniParseError {
  line: number;
  file?: string;
  message: string;
}

export interface IniParseOptions {
  /** Resolve #include paths. Return file contents or null if not found. */
  resolveInclude?: (path: string) => string | null;
  /** Current file path for error reporting. */
  filePath?: string;
  /** Pre-existing defines from prior files. */
  defines?: Map<string, string>;
  /** Already-included file paths (cycle detection). */
  includedFiles?: Set<string>;
}

interface TokenizedLine {
  lineNumber: number;
  file?: string;
  tokens: string[];
  raw: string;
}

/** Singleton block types that have no name identifier. */
const SINGLETON_BLOCK_TYPES = new Set([
  'GameData', 'MiscAudio', 'InGameUI', 'DrawGroupInfo',
  'MultiplayerSettings', 'Weather', 'AnimationSoundClientBehaviorGlobalSetting',
]);

/**
 * Parse an INI file string into structured blocks.
 *
 * Preprocessing resolves #include and #define directives line-by-line,
 * so defines from an included file are available to subsequent lines.
 */
export function parseIni(source: string, options: IniParseOptions = {}): IniParseResult {
  const defines = new Map(options.defines ?? []);
  const includedFiles = new Set(options.includedFiles ?? []);
  const filePath = options.filePath;
  const includes: string[] = [];
  const errors: IniParseError[] = [];

  if (filePath) {
    includedFiles.add(filePath);
  }

  // Preprocess: flatten #include and resolve #define line-by-line
  const lines = preprocess(source, filePath, defines, includedFiles, includes, errors, options);

  // Parse blocks from preprocessed lines
  const blocks: IniBlock[] = [];
  let cursor = 0;

  while (cursor < lines.length) {
    const line = lines[cursor]!;
    const tokens = line.tokens;

    if (tokens.length === 0) {
      cursor++;
      continue;
    }

    const blockType = tokens[0]!;

    // Top-level block declarations
    if (isBlockStart(blockType)) {
      // Singleton blocks (GameData, etc.) — no name required
      if (tokens.length === 1 && SINGLETON_BLOCK_TYPES.has(blockType)) {
        const result = parseBlock(lines, cursor, errors);
        result.block.name = '';
        blocks.push(result.block);
        cursor = result.nextCursor;
      } else if (tokens.length >= 2) {
        const result = parseBlock(lines, cursor, errors);
        blocks.push(result.block);
        cursor = result.nextCursor;
      } else {
        errors.push({
          line: line.lineNumber,
          file: line.file,
          message: `Block "${blockType}" requires a name`,
        });
        cursor++;
      }
    } else {
      errors.push({
        line: line.lineNumber,
        file: line.file,
        message: `Unexpected token at top level: "${blockType}"`,
      });
      cursor++;
    }
  }

  return { blocks, errors, includes, defines };
}

/**
 * Preprocess source into a flat list of tokenized lines.
 * Resolves #include directives inline and applies #define substitutions
 * as they are encountered, so defines from earlier lines (or includes)
 * are available to later lines.
 */
function preprocess(
  source: string,
  filePath: string | undefined,
  defines: Map<string, string>,
  includedFiles: Set<string>,
  includes: string[],
  errors: IniParseError[],
  options: IniParseOptions,
): TokenizedLine[] {
  const rawLines = source.split(/\r?\n/);
  const result: TokenizedLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i]!;
    const lineNumber = i + 1;

    // Strip comments (; and //)
    const semiIndex = line.indexOf(';');
    if (semiIndex !== -1) line = line.substring(0, semiIndex);
    const slashIndex = line.indexOf('//');
    if (slashIndex !== -1) line = line.substring(0, slashIndex);

    line = line.trim();
    if (line.length === 0) continue;

    // Tokenize
    let tokens = tokenizeLine(line);
    if (tokens.length === 0) continue;

    const first = tokens[0]!;

    // Handle #define — add to defines map, skip line
    if (first === '#define' && tokens.length >= 3) {
      defines.set(tokens[1]!, tokens.slice(2).join(' '));
      continue;
    }

    // Handle #include — resolve and recursively preprocess
    if (first === '#include') {
      const includePath = tokens[1];
      if (includePath) {
        includes.push(includePath);
        if (options.resolveInclude) {
          if (includedFiles.has(includePath)) {
            errors.push({
              line: lineNumber,
              file: filePath,
              message: `Circular #include detected: "${includePath}"`,
            });
          } else {
            includedFiles.add(includePath);
            const content = options.resolveInclude(includePath);
            if (content !== null) {
              const subLines = preprocess(
                content, includePath, defines, includedFiles,
                includes, errors, options,
              );
              result.push(...subLines);
            } else {
              errors.push({
                line: lineNumber,
                file: filePath,
                message: `#include file not found: "${includePath}"`,
              });
            }
          }
        }
      }
      continue;
    }

    // Apply #define macro substitution
    if (defines.size > 0) {
      tokens = tokens.map((t) => defines.get(t) ?? t);
      // Re-tokenize if a macro expanded to multiple words
      tokens = tokens.flatMap((t) => t.includes(' ') ? t.split(/\s+/) : [t]);
    }

    result.push({ lineNumber, file: filePath, tokens, raw: rawLines[i]! });
  }

  return result;
}

function parseBlock(
  lines: TokenizedLine[],
  startCursor: number,
  errors: IniParseError[],
): { block: IniBlock; nextCursor: number } {
  const headerLine = lines[startCursor]!;
  const tokens = headerLine.tokens;

  const type = tokens[0]!;
  let name = tokens[1] ?? '';
  let parent: string | undefined;

  // Handle inheritance: Object Foo : Bar
  const colonIndex = tokens.indexOf(':');
  if (colonIndex !== -1 && colonIndex + 1 < tokens.length) {
    name = tokens.slice(1, colonIndex).join(' ');
    parent = tokens[colonIndex + 1];
  } else {
    name = tokens.slice(1).join(' ');
  }

  const block: IniBlock = {
    type,
    name,
    parent,
    fields: {},
    blocks: [],
  };

  let cursor = startCursor + 1;

  while (cursor < lines.length) {
    const line = lines[cursor]!;
    const lineTokens = line.tokens;

    if (lineTokens.length === 0) {
      cursor++;
      continue;
    }

    const firstToken = lineTokens[0]!;

    // End of block
    if (firstToken === 'End') {
      cursor++;
      break;
    }

    // AddModule / ReplaceModule — treated as sub-blocks with special type prefix
    if ((firstToken === 'AddModule' || firstToken === 'ReplaceModule') && lineTokens.length >= 2) {
      const result = parseBlock(lines, cursor, errors);
      result.block.type = firstToken;
      result.block.name = lineTokens.slice(1).join(' ');
      block.blocks.push(result.block);
      cursor = result.nextCursor;
      continue;
    }

    // RemoveModule — single-line directive
    if (firstToken === 'RemoveModule' && lineTokens.length >= 2) {
      block.blocks.push({
        type: 'RemoveModule',
        name: lineTokens.slice(1).join(' '),
        fields: {},
        blocks: [],
      });
      cursor++;
      continue;
    }

    // Sub-block (e.g., "Body = ActiveBody ModuleTag_02")
    if (isSubBlockDeclaration(lineTokens)) {
      const result = parseBlock(lines, cursor, errors);
      // For sub-blocks declared as "Key = Type Tag", use composite naming
      if (lineTokens.length >= 4 && lineTokens[1] === '=') {
        result.block.type = lineTokens[0]!;
        result.block.name = lineTokens.slice(2).join(' ');
      }
      block.blocks.push(result.block);
      cursor = result.nextCursor;
      continue;
    }

    // += additive field: "KindOf += VEHICLE"
    const plusEqualsIndex = lineTokens.indexOf('+=');
    if (plusEqualsIndex !== -1) {
      const key = lineTokens.slice(0, plusEqualsIndex).join(' ');
      const newValues = lineTokens.slice(plusEqualsIndex + 1);
      const existing = block.fields[key];
      if (Array.isArray(existing)) {
        block.fields[key] = [...existing, ...newValues] as IniValue;
      } else if (existing !== undefined) {
        block.fields[key] = [existing as string, ...newValues] as IniValue;
      } else {
        block.fields[key] = parseFieldValue(newValues);
      }
      cursor++;
      continue;
    }

    // Regular field: "Key = Value" or "Key = Value1 Value2 ..."
    const equalsIndex = lineTokens.indexOf('=');
    if (equalsIndex !== -1) {
      const key = lineTokens.slice(0, equalsIndex).join(' ');
      const valueParts = lineTokens.slice(equalsIndex + 1);
      block.fields[key] = parseFieldValue(valueParts);
    } else {
      // Standalone keyword or flag (e.g., just "End" or flag names)
      block.fields[firstToken] = true;
    }

    cursor++;
  }

  return { block, nextCursor: cursor };
}

/**
 * Determine if a line starts a sub-block.
 */
const SUB_BLOCK_TYPES = new Set([
  'Body', 'Behavior', 'Draw', 'AI', 'Locomotor', 'LocomotorSet',
  'ArmorSet', 'WeaponSet', 'UnitSpecificSounds', 'ClientUpdate',
  'ClientBehavior', 'Flammability', 'ThreatBreakdown',
  'VeterancyLevels', 'TransitionState', 'CrowdResponse',
  'FireWeaponNugget', 'DamageNugget', 'MetaImpactNugget',
  'DOTNugget', 'WeaponOCLNugget', 'AttributeModifierNugget',
  'ParalyzeNugget', 'SpawnAndFadeNugget', 'FireLogicNugget',
  'Prerequisite', 'ObjectStatusOfContained', 'InheritableModule',
  'OverridableByLikeKind', 'ReplaceModule', 'AddModule',
]);

function isSubBlockDeclaration(tokens: string[]): boolean {
  if (tokens.length < 2) return false;
  const firstToken = tokens[0]!;
  // "Body = ActiveBody ModuleTag_XX"
  if (tokens[1] === '=' && tokens.length >= 4 && SUB_BLOCK_TYPES.has(firstToken)) {
    return true;
  }
  // Direct block starters without = sign
  if (SUB_BLOCK_TYPES.has(firstToken) && tokens.length >= 2 && tokens[1] !== '=') {
    return true;
  }
  return false;
}

const TOP_LEVEL_BLOCK_TYPES = new Set([
  'Object', 'ChildObject', 'Weapon', 'Armor', 'DamageFX', 'Science',
  'Upgrade', 'SpecialPower', 'CommandButton', 'CommandSet',
  'PlayerTemplate', 'Multisound', 'AudioEvent', 'MusicTrack',
  'DialogEvent', 'Video', 'Campaign', 'Mission', 'Locomotor',
  'ObjectCreationList', 'FXList', 'Animation', 'ParticleSystem',
  'Faction', 'CrateData', 'ExperienceLevel', 'ModifierList',
  'MultiplayerSettings', 'GameData', 'Terrain', 'Road', 'Bridge',
  'Weather', 'WaterSet', 'SkyboxTextureSet', 'MappedImage',
  'DrawGroupInfo', 'WindowTransition', 'HeaderTemplate',
  'EvaEvent', 'WebpageURL', 'InGameUI', 'ControlBarScheme',
  'ControlBarResizer', 'ShellMenuScheme', 'MiscAudio',
  'AnimationSoundClientBehaviorGlobalSetting',
]);

function isBlockStart(token: string): boolean {
  return TOP_LEVEL_BLOCK_TYPES.has(token);
}

/** Parse a field value from tokens. */
function parseFieldValue(tokens: string[]): IniValue {
  if (tokens.length === 0) return '';
  if (tokens.length === 1) return parseSingleValue(tokens[0]!);

  // Multiple values — could be a list of flags, coords, etc.
  const allNumbers = tokens.every((t) => !isNaN(parseFloat(t)) && isFinite(Number(t)));
  if (allNumbers) {
    return tokens.map((t) => parseFloat(t));
  }

  // Return as string array (e.g., KindOf flags)
  return tokens;
}

function parseSingleValue(token: string): IniValue {
  // Boolean
  const lower = token.toLowerCase();
  if (lower === 'yes' || lower === 'true') return true;
  if (lower === 'no' || lower === 'false') return false;

  // Percentage
  if (token.endsWith('%')) {
    return parseFloat(token) / 100;
  }

  // Number (handles both "300" and "300.0")
  if (/^-?(\d+\.?\d*|\.\d+)$/.test(token)) {
    return parseFloat(token);
  }

  // Hex number
  if (token.startsWith('0x') || token.startsWith('0X')) {
    const hex = parseInt(token, 16);
    if (!isNaN(hex)) return hex;
  }

  // String
  return token;
}

function tokenizeLine(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && /\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}
