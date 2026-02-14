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
 * The parser produces a structured JSON representation.
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
}

export interface IniParseError {
  line: number;
  message: string;
}

interface TokenizedLine {
  lineNumber: number;
  tokens: string[];
  raw: string;
}

/**
 * Parse an INI file string into structured blocks.
 */
export function parseIni(source: string): IniParseResult {
  const lines = tokenizeLines(source);
  const blocks: IniBlock[] = [];
  const errors: IniParseError[] = [];
  let cursor = 0;

  while (cursor < lines.length) {
    const line = lines[cursor]!;
    const tokens = line.tokens;

    if (tokens.length === 0) {
      cursor++;
      continue;
    }

    const blockType = tokens[0]!;

    // Top-level block declarations: Object, Weapon, Armor, Science, etc.
    if (isBlockStart(blockType) && tokens.length >= 2) {
      const result = parseBlock(lines, cursor, errors);
      blocks.push(result.block);
      cursor = result.nextCursor;
    } else if (blockType === '#include' || blockType === '#define') {
      // Preprocessor directives — skip for now, handled at build time
      cursor++;
    } else {
      errors.push({
        line: line.lineNumber,
        message: `Unexpected token at top level: "${blockType}"`,
      });
      cursor++;
    }
  }

  return { blocks, errors };
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
 * Sub-blocks follow pattern: "Key = Type Tag" where the next lines
 * contain more fields before an "End" token.
 *
 * Known sub-block starters: Body, Behavior, Draw, AI, Locomotor,
 * ArmorSet, WeaponSet, UnitSpecificSounds, etc.
 */
const SUB_BLOCK_TYPES = new Set([
  'Body', 'Behavior', 'Draw', 'AI', 'Locomotor', 'LocomotorSet',
  'ArmorSet', 'WeaponSet', 'UnitSpecificSounds', 'ClientUpdate',
  'ClientBehavior', 'Flammability', 'ThreatBreakdown',
  'VeterancyLevels', 'TransitionState', 'CrowdResponse',
  'FireWeaponNugget', 'DamageNugget', 'MetaImpactNugget',
  'DOTNugget', 'WeaponOCLNugget', 'AttributeModifierNugget',
  'ParalyzeNugget', 'SpawnAndFadeNugget', 'FireLogicNugget',
  'Prerequisite',
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
]);

function isBlockStart(token: string): boolean {
  return TOP_LEVEL_BLOCK_TYPES.has(token);
}

/** Parse a field value from tokens. */
function parseFieldValue(tokens: string[]): IniValue {
  if (tokens.length === 0) return '';
  if (tokens.length === 1) return parseSingleValue(tokens[0]!);

  // Multiple values — could be a list of flags, coords, etc.
  // Try to detect if all values are numbers (e.g., coordinates)
  const allNumbers = tokens.every((t) => !isNaN(parseFloat(t)) && isFinite(Number(t)));
  if (allNumbers) {
    return tokens.map((t) => parseFloat(t));
  }

  // Check for percentage values
  if (tokens.length === 1 && tokens[0]!.endsWith('%')) {
    return parseFloat(tokens[0]!) / 100;
  }

  // Boolean values
  if (tokens.length === 1) {
    const lower = tokens[0]!.toLowerCase();
    if (lower === 'yes' || lower === 'true') return true;
    if (lower === 'no' || lower === 'false') return false;
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

/** Tokenize source into lines, stripping comments and whitespace. */
function tokenizeLines(source: string): TokenizedLine[] {
  const rawLines = source.split(/\r?\n/);
  const result: TokenizedLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i]!;

    // Strip comments (;  and //)
    const semiIndex = line.indexOf(';');
    if (semiIndex !== -1) line = line.substring(0, semiIndex);
    const slashIndex = line.indexOf('//');
    if (slashIndex !== -1) line = line.substring(0, slashIndex);

    line = line.trim();
    if (line.length === 0) continue;

    // Tokenize by whitespace, preserving quoted strings
    const tokens = tokenizeLine(line);
    if (tokens.length > 0) {
      result.push({ lineNumber: i + 1, tokens, raw: rawLines[i]! });
    }
  }

  return result;
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
