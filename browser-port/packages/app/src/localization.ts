import type { AssetManager } from '@generals/assets';

export interface LocalizationEntry {
  text: string;
  speech?: string;
}

export interface LocalizationData {
  version: number;
  language: number;
  entries: Record<string, LocalizationEntry>;
}

export function buildLocalizationStrings(
  dataSets: readonly (LocalizationData | null | undefined)[],
): Map<string, string> {
  const localizedStrings = new Map<string, string>();

  for (const data of dataSets) {
    if (!data) {
      continue;
    }
    for (const [label, entry] of Object.entries(data.entries)) {
      if (!localizedStrings.has(label) && entry.text.length > 0) {
        localizedStrings.set(label, entry.text);
      }
    }
  }

  return localizedStrings;
}

export function resolveLocalizedText(
  value: string,
  localizedStrings: ReadonlyMap<string, string>,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return localizedStrings.get(trimmed) ?? value;
}

export async function loadLocalizationStrings(
  assets: AssetManager,
  assetPaths: readonly string[],
): Promise<Map<string, string>> {
  const loadedData: LocalizationData[] = [];

  for (const assetPath of assetPaths) {
    try {
      const handle = await assets.loadJSON<LocalizationData>(assetPath);
      loadedData.push(handle.data);
    } catch (error) {
      console.warn(`Localization asset unavailable: ${assetPath}`, error);
    }
  }

  return buildLocalizationStrings(loadedData);
}
