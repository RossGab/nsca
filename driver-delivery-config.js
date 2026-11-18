// Shared by the web driver and APK. Storage is supplied by each platform.
export function deliveryJobKey(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function usableDeliveryMethods(methods) {
  return !!methods && typeof methods === 'object' && !Array.isArray(methods) &&
    Object.keys(methods).length > 0 && Object.entries(methods).every(([name, block]) =>
      name.trim() && block && typeof block === 'object' && !Array.isArray(block));
}

export function createDeliveryConfigLoader({ storage, fetchConfig, fetchJobTypes,
  online = () => navigator.onLine, timeoutMs = 8000, report = () => {} }) {
  const storageKey = 'driverUIConfigCache';
  const memory = new Map();
  const pending = new Map();
  const methodsOf = entry => entry?.deliveryMethods || entry;
  function read() {
    try {
      const value = JSON.parse(storage.getItem(storageKey) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (error) { report('delivery_cache_read_failed', error); return {}; }
  }
  function matchingKey(values, key) {
    const matches = Object.keys(values).filter(name => deliveryJobKey(name) === key);
    if (matches.length > 1) throw new Error('Multiple delivery configurations match this job type. Ask the administrator to check its configuration.');
    return matches[0];
  }
  async function bounded(action) {
    let timer;
    try {
      return await Promise.race([Promise.resolve().then(action), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Delivery configuration request timed out.')), timeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  }
  async function load(value, { force = false, requirePersisted = false } = {}) {
    const key = deliveryJobKey(value);
    if (!key) throw new Error('This task has no job type. Ask the administrator to check it.');
    const inMemory = memory.get(key);
    let cached = inMemory;
    if (!cached) {
      const saved = read();
      const name = matchingKey(saved, key);
      if (name && usableDeliveryMethods(methodsOf(saved[name]))) {
        cached = { methods: methodsOf(saved[name]), persisted: true };
      }
    }
    if (cached && !force && (inMemory || !online()) && (!requirePersisted || cached.persisted)) {
      memory.set(key, cached);
      return cached;
    }
    if (!pending.has(key)) {
      const work = (async () => {
        try {
          if (!online()) throw new Error('Connect to the internet to load delivery options for this job type.');
          const config = await bounded(async () => {
            let result = await fetchConfig(String(value).trim());
            if (!usableDeliveryMethods(result?.deliveryMethods)) {
              // Match harmless spacing/case differences without modifying task identity.
              const all = await fetchJobTypes();
              const name = matchingKey(all || {}, key);
              result = name ? all[name] : null;
            }
            if (!usableDeliveryMethods(result?.deliveryMethods)) {
              throw new Error('No delivery options are configured for this job type. Ask the administrator to check it.');
            }
            return result;
          });
          const result = { methods: config.deliveryMethods, persisted: false };
          try {
            // Merge at write time: concurrent job-type loads must not erase each other.
            const saved = read();
            for (const name of Object.keys(saved)) {
              if (deliveryJobKey(name) === key) delete saved[name];
            }
            saved[key] = { updatedAt: config.updatedAt || null, deliveryMethods: result.methods };
            storage.setItem(storageKey, JSON.stringify(saved));
            await storage.flush?.();
            const written = read();
            result.persisted = usableDeliveryMethods(written[key]?.deliveryMethods);
          } catch (error) { report('delivery_cache_write_failed', error); }
          memory.set(key, result);
          return result;
        } catch (error) {
          report('delivery_config_unavailable', error);
          if (cached) { memory.set(key, cached); return cached; }
          // Never cache an empty or failed response; the next attempt can recover.
          throw error;
        }
      })();
      pending.set(key, work);
    }
    let result;
    try { result = await pending.get(key); }
    finally { pending.delete(key); }
    if (requirePersisted && !result.persisted) {
      throw new Error('Delivery options could not be saved for offline use. Free device storage and retry the download.');
    }
    return result;
  }
  return { load };
}
