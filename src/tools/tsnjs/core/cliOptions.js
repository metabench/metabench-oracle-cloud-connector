'use strict';

function normalizeBooleanOption(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized.length === 0) {
      return false;
    }
    return (
      normalized === 'true' ||
      normalized === '1' ||
      normalized === 'yes' ||
      normalized === 'y'
    );
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  return Boolean(value);
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
}

function formatLimitValue(limit, options = {}) {
  const infiniteLabel = typeof options === 'boolean'
    ? (options ? '∞' : 'unlimited')
    : options && options.infiniteLabel !== undefined
      ? options.infiniteLabel
      : 'unlimited';

  if (limit === 0) {
    return infiniteLabel;
  }
  return limit;
}

function lookupKeyword(keywordMap, key) {
  if (!keywordMap) {
    return undefined;
  }

  if (keywordMap instanceof Map) {
    return keywordMap.get(key);
  }

  if (typeof keywordMap === 'object' && keywordMap !== null && Object.prototype.hasOwnProperty.call(keywordMap, key)) {
    return keywordMap[key];
  }

  return undefined;
}

function normalizeViewMode(raw, options = {}) {
  const defaultMode = typeof options.defaultMode === 'string' && options.defaultMode.length > 0
    ? options.defaultMode
    : 'detailed';
  const keywordMap = options.keywordMap;
  const allowedModes = Array.isArray(options.allowedModes) ? options.allowedModes : [];
  const allowedSet = new Set(allowedModes.map((mode) => String(mode).toLowerCase()));
  if (raw === undefined || raw === null) {
    return defaultMode;
  }

  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = String(candidate).trim();
  if (trimmed.length === 0) {
    return defaultMode;
  }

  const lower = trimmed.toLowerCase();

  const mappedLower = lookupKeyword(keywordMap, lower);
  if (typeof mappedLower === 'string') {
    return mappedLower;
  }

  const mappedExact = lookupKeyword(keywordMap, trimmed);
  if (typeof mappedExact === 'string') {
    return mappedExact;
  }

  if (allowedSet.has(lower)) {
    return lower;
  }

  return null;
}

function resolveAlias(aliasMap, key) {
  if (!aliasMap) {
    return undefined;
  }

  if (aliasMap instanceof Map) {
    return aliasMap.get(key);
  }

  if (typeof aliasMap === 'object' && aliasMap !== null && Object.prototype.hasOwnProperty.call(aliasMap, key)) {
    return aliasMap[key];
  }

  return undefined;
}

function parseFieldList(raw, options = {}) {
  const defaultFields = Array.isArray(options.defaultFields) ? Array.from(options.defaultFields) : [];
  const aliasMap = options.aliasMap;
  const allowedFields = Array.isArray(options.allowedFields) ? options.allowedFields : null;
  const allowedSet = allowedFields ? new Set(allowedFields.map((field) => String(field).toLowerCase())) : null;

  if (raw === undefined || raw === null) {
    return defaultFields;
  }

  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = String(value).trim();
  if (trimmed.length === 0) {
    return defaultFields;
  }

  const lowerTrimmed = trimmed.toLowerCase();
  if (resolveAlias(aliasMap, lowerTrimmed) === 'default') {
    return defaultFields;
  }

  const tokens = trimmed.split(/[\s,|]+/);
  const resolved = [];

  tokens.forEach((token) => {
    if (!token) {
      return;
    }
    const normalized = token.trim().toLowerCase();
    if (!normalized) {
      return;
    }
    const mapped = resolveAlias(aliasMap, normalized) || normalized;
    const canonical = String(mapped);
    const canonicalLower = canonical.toLowerCase();
    if (allowedSet && !allowedSet.has(canonicalLower)) {
      return;
    }
    if (!resolved.includes(canonical)) {
      resolved.push(canonical);
    }
  });

  if (resolved.length === 0) {
    return defaultFields;
  }

  return resolved;
}

module.exports = {
  normalizeBooleanOption,
  normalizeViewMode,
  formatLimitValue,
  parseFieldList,
  toArray
};
