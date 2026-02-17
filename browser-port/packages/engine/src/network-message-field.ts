/**
 * Network message field extraction helpers shared across engine/network boundaries.
 */

export type NetworkMessageLike = { [key: string]: unknown };

export function resolveNetworkNumericField(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.length) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function resolveNetworkTextField(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function resolveNetworkMessageGetter(message: NetworkMessageLike, method: string): unknown {
  const getter = message[method];
  if (typeof getter !== 'function') {
    return undefined;
  }
  try {
    return getter.call(message);
  } catch {
    return undefined;
  }
}

export function resolveNetworkNumericFieldFromMessage(
  message: NetworkMessageLike,
  keys: readonly string[],
  getters: readonly string[] = [],
): number | null {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(message, key)) {
      continue;
    }
    const value = resolveNetworkNumericField(message[key]);
    if (value !== null) {
      return value;
    }
  }

  for (const getter of getters) {
    const value = resolveNetworkMessageGetter(message, getter);
    const resolved = resolveNetworkNumericField(value);
    if (resolved !== null) {
      return resolved;
    }
  }

  return null;
}

export function resolveNetworkTextFieldFromMessage(
  message: NetworkMessageLike,
  keys: readonly string[],
  getters: readonly string[] = [],
): string | null {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(message, key)) {
      continue;
    }
    const value = resolveNetworkTextField(message[key]);
    if (value !== null) {
      return value;
    }
  }

  for (const getter of getters) {
    const value = resolveNetworkMessageGetter(message, getter);
    const resolved = resolveNetworkTextField(value);
    if (resolved !== null) {
      return resolved;
    }
  }

  return null;
}
