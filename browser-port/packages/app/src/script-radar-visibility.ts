export function resolveScriptRadarVisibility(
  scriptRadarHidden: boolean,
  scriptRadarForced: boolean,
): boolean {
  if (scriptRadarForced) {
    return true;
  }
  return !scriptRadarHidden;
}
