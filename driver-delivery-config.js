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
  function matchingKey(values, key, preferred, extract = entry => entry?.deliveryMethods) {
    const matches = Object.keys(values).filter(name => deliveryJobKey(name) === key && usableDeliveryMethods(extract(values[name])));
    // Old caches can contain both NOD and "NOD ". An exact valid match wins.
    if (matches.includes(preferred)) return preferred;
    if (matches.length > 1) {
      const signatures = matches.map(name => JSON.stringify(extract(values[name]), (_, item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? Object.fromEntries(Object.keys(item).sort().map(field => [field, item[field]])) : item));
      if (!signatures.every(signature => signature === signatures[0])) {
        throw new Error('Multiple delivery configurations match this job type. Ask the administrator to check its configuration.');
      }
    }
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
    const preferred = String(value || '').trim();
    if (!key) throw new Error('This task has no job type. Ask the administrator to check it.');
    const inMemory = memory.get(key);
    let cached = inMemory;
    if (!cached || requirePersisted) {
      const saved = read();
      // Readiness must verify actual saved data, not an old in-memory flag.
      if (requirePersisted) cached = null;
      try {
        const name = matchingKey(saved, key, preferred, methodsOf);
        if (name) cached = { methods: methodsOf(saved[name]), persisted: true };
      } catch (error) {
        // Conflicting saved aliases must not prevent fetching a clean server copy.
        report('delivery_cache_conflict', error);
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
            let result = await fetchConfig(preferred);
            if (!usableDeliveryMethods(result?.deliveryMethods)) {
              // Match harmless spacing/case differences without modifying task identity.
              const all = await fetchJobTypes();
              const name = matchingKey(all || {}, key, preferred);
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

// One check per job type, regardless of whether there are 5 or 500 tasks.
export async function checkDeliveryReadiness(tasks, loadConfig) {
  const groups = new Map();
  for (const task of tasks) {
    const key = deliveryJobKey(task.JOBTYPE);
    if (!groups.has(key)) groups.set(key, { jobType: task.JOBTYPE, taskKeys: [] });
    groups.get(key).taskKeys.push(task._key);
  }
  const results = await Promise.all([...groups.values()].map(async group => {
    try {
      const methods = await loadConfig(group.jobType, { requirePersisted: true });
      if (!usableDeliveryMethods(methods)) throw new Error('Delivery options are missing.');
      return null;
    } catch (error) {
      return { ...group, reason: error.message || 'Delivery options could not be checked.' };
    }
  }));
  const failures = results.filter(Boolean);
  return { ready: failures.length === 0, taskCount: tasks.length, typeCount: groups.size, failures };
}

export function createDeliveryReadinessController({ document, getTasks, getTask, loadConfig, isActionable,
  isBusy, renderAvailable, report = () => {}, notify = () => {}, online = () => navigator.onLine }) {
  let pending, timer, automaticAttempts = 0, acknowledged = null, readyFingerprint = null;
  const banner = document.getElementById('deliveryReadinessBanner');
  const label = document.getElementById('deliveryReadinessText');
  const retry = document.getElementById('deliveryReadinessRetry');
  const okay = document.getElementById('deliveryReadinessOkay');
  async function check(savedTasks) {
    if (pending) return pending;
    clearTimeout(timer);
    banner.hidden = acknowledged !== null && banner.dataset.state === 'ready';
    banner.dataset.state = 'checking';
    label.textContent = 'Checking delivery options for saved tasks...';
    retry.hidden = true;
    okay.hidden = true;
    const work = (async () => {
      try {
        const tasks = (savedTasks || await getTasks()).filter(isActionable);
        const result = await checkDeliveryReadiness(tasks, loadConfig);
        banner.dataset.state = result.ready ? 'ready' : 'blocked';
        if (result.ready) {
          readyFingerprint = JSON.stringify(tasks.map(task => [task._key, deliveryJobKey(task.JOBTYPE)]).sort());
          banner.hidden = acknowledged === readyFingerprint;
          okay.hidden = false;
        } else {
          acknowledged = null;
          banner.hidden = false;
        }
        if (!result.taskCount) label.textContent = 'No unfinished tasks to prepare.';
        else if (result.ready) label.textContent = `Delivery options ready offline for all ${result.taskCount} saved tasks.`;
        else {
          const names = result.failures.map(item => item.jobType || 'task without a job type').join(', ');
          label.textContent = `Not ready for offline work. Delivery options need attention: ${names}. Connect and tap Retry. If it still fails, contact the administrator.`;
          retry.hidden = false;
        }
        const failedKeys = new Set(result.failures.flatMap(group => group.taskKeys));
        for (const task of tasks) {
          if (!failedKeys.has(task._key)) renderAvailable(task);
        }
        report('delivery_readiness_checked', { taskCount: result.taskCount, jobTypes: result.typeCount, failed: result.failures.length });
        if (result.ready) automaticAttempts = 0;
        else if (online() && automaticAttempts < 3) {
          timer = setTimeout(schedule, [5000, 15000, 30000][automaticAttempts++]);
        }
        return result;
      } catch (error) {
        acknowledged = null;
        banner.hidden = false;
        okay.hidden = true;
        banner.dataset.state = 'blocked';
        label.textContent = 'Could not verify saved delivery options. Tap Retry before starting work. Your saved tasks and photos are kept.';
        retry.hidden = false;
        report('delivery_readiness_failed', { error: error.message });
        return { ready: false, failures: [] };
      }
    })();
    pending = work;
    try { return await work; }
    finally { if (pending === work) pending = null; }
  }
  async function ensure(taskKey, selectedTask) {
    try {
      const task = selectedTask || (getTask ? await getTask(taskKey) : (await getTasks()).find(item => item._key === taskKey));
      if (!task || task._key !== taskKey || !isActionable(task)) throw new Error('The saved task is not available for work.');
      const methods = await loadConfig(task.JOBTYPE, { requirePersisted: true });
      if (!usableDeliveryMethods(methods)) throw new Error('Delivery options are missing.');
      return true;
    } catch (error) {
      await check();
      banner.scrollIntoView({ block: 'center', behavior: 'smooth' });
      notify('This task is not ready: its delivery options are unavailable. Connect and tap Retry above before starting work. Your existing photos and entries are kept.');
      return false;
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (isBusy()) { timer = setTimeout(schedule, 2000); return; }
    void check();
  }
  retry.addEventListener('click', () => { automaticAttempts = 0; schedule(); });
  okay.addEventListener('click', () => {
    if (banner.dataset.state !== 'ready') return;
    acknowledged = readyFingerprint;
    banner.hidden = true;
  });
  return { check, ensure, schedule, dispose: () => clearTimeout(timer) };
}
