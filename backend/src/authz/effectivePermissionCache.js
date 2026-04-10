const DEFAULT_TTL_MS = Number(
  process.env.AUTHZ_PERMISSION_CACHE_TTL_MS ||
    (process.env.NODE_ENV === "development" ? 10_000 : 30_000),
);

const rawGrantCache = new Map();
const effectiveContextCache = new Map();

const now = () => Date.now();

const isExpired = (entry) => {
  if (!entry) return true;
  return entry.expiresAt <= now();
};

const getCachedValue = (cache, key) => {
  const entry = cache.get(key);
  if (isExpired(entry)) {
    cache.delete(key);
    return null;
  }
  return entry.value;
};

const setCachedValue = (cache, key, value, ttlMs = DEFAULT_TTL_MS) => {
  cache.set(key, {
    value,
    expiresAt: now() + Math.max(1_000, Number(ttlMs || DEFAULT_TTL_MS)),
  });
  return value;
};

export const getOrLoadRawPermissionGrants = async (cacheKey, loader, ttlMs) => {
  const cached = getCachedValue(rawGrantCache, cacheKey);
  if (cached) return cached;
  const loaded = await loader();
  return setCachedValue(rawGrantCache, cacheKey, loaded, ttlMs);
};

export const getOrLoadEffectiveContext = async (cacheKey, loader, ttlMs) => {
  const cached = getCachedValue(effectiveContextCache, cacheKey);
  if (cached) return cached;
  const loaded = await loader();
  return setCachedValue(effectiveContextCache, cacheKey, loaded, ttlMs);
};

export const invalidateUserPermissionCache = (userId) => {
  const target = String(userId || "").trim();
  if (!target) return;

  for (const key of rawGrantCache.keys()) {
    if (key.startsWith(`${target}:`)) {
      rawGrantCache.delete(key);
    }
  }

  for (const key of effectiveContextCache.keys()) {
    if (key.startsWith(`${target}:`)) {
      effectiveContextCache.delete(key);
    }
  }
};

export const clearPermissionCache = () => {
  rawGrantCache.clear();
  effectiveContextCache.clear();
};

export const prunePermissionCache = () => {
  for (const key of rawGrantCache.keys()) {
    getCachedValue(rawGrantCache, key);
  }
  for (const key of effectiveContextCache.keys()) {
    getCachedValue(effectiveContextCache, key);
  }
};

export default {
  getOrLoadRawPermissionGrants,
  getOrLoadEffectiveContext,
  invalidateUserPermissionCache,
  clearPermissionCache,
  prunePermissionCache,
};
