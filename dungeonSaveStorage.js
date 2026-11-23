const DATABASE_NAME = "roguelike_dungeon";
const STORE_NAME = "saves";
const SAVE_SLOT = "current";
const SYNCED_FALLBACK_SLOT = "syncedFallbackId";
const LEGACY_KEY = "roguelike_dungeon_save_v1";

let databasePromise = null;
let operations = Promise.resolve();
let latestWrite = 0;

function inOrder(operation) {
  const result = operations.then(operation);
  operations = result.catch(() => {});
  return result;
}

function getDatabase() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  if (databasePromise) return databasePromise;

  const opening = new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Dungeon save database is blocked"));
    request.onsuccess = () => {
      const database = request.result;
      if (databasePromise !== opening) {
        database.close();
        return;
      }
      const forgetConnection = () => {
        if (databasePromise === opening) databasePromise = null;
      };
      database.onclose = forgetConnection;
      database.onversionchange = () => {
        database.close();
        forgetConnection();
      };
      resolve(database);
    };
  });
  databasePromise = opening;
  opening.catch(() => {
    if (databasePromise === opening) databasePromise = null;
  });
  return opening;
}

function transaction(database, mode, operation) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, mode);
    const request = operation(tx.objectStore(STORE_NAME));
    // A successful request can still be rolled back before the transaction commits.
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error ?? new DOMException("Save transaction aborted", "AbortError"));
  });
}

function readFromDatabase(database) {
  return transaction(database, "readonly", store => store.get(SAVE_SLOT));
}

async function openDatabaseIfAvailable() {
  try { return await getDatabase(); } catch { return null; }
}

function localSaveRaw() {
  try { return localStorage.getItem(LEGACY_KEY); } catch { return null; }
}

function parseLocalSave(raw) {
  try { return raw == null ? null : JSON.parse(raw); } catch { return null; }
}

function isFallbackSave(record) {
  return typeof record?.fallbackId === "string";
}

function localSaveData(record) {
  return isFallbackSave(record) ? record.data : record;
}

function removeLocalSave(raw) {
  if (raw === null) return;
  try {
    if (localStorage.getItem(LEGACY_KEY) === raw) localStorage.removeItem(LEGACY_KEY);
  } catch { /* A committed IndexedDB record retains the synchronized fallback ID. */ }
}

async function syncFallbackSave(database, isValid) {
  let data;
  let syncedRaw = null;
  await transaction(database, "readwrite", store => {
    const syncedId = store.get(SYNCED_FALLBACK_SLOT);
    const request = store.get(SAVE_SLOT);
    request.onsuccess = () => {
      data = request.result;
      // This transaction may have waited behind another tab updating the slot.
      const raw = localSaveRaw();
      const fallback = parseLocalSave(raw);
      if (!isFallbackSave(fallback)) return;
      if (syncedId.result !== fallback.fallbackId) {
        if (fallback.data !== null && !isValid(fallback.data)) return;
        store.put(fallback.data, SAVE_SLOT);
        store.put(fallback.fallbackId, SYNCED_FALLBACK_SLOT);
        data = fallback.data;
      }
      syncedRaw = raw;
    };
    return request;
  });
  removeLocalSave(syncedRaw);
  return data;
}

export function readStoredGameSave(isValid, { migrateLegacy = false } = {}) {
  return inOrder(async () => {
    const database = await openDatabaseIfAvailable();
    const raw = localSaveRaw();
    const local = parseLocalSave(raw);
    if (!database) return localSaveData(local);
    try {
      if (isFallbackSave(local)) return await syncFallbackSave(database, isValid);
      const stored = await readFromDatabase(database);
      if (stored !== undefined) {
        if (stored === null || (migrateLegacy && isValid(stored))) removeLocalSave(raw);
        return stored;
      }

      if (!migrateLegacy || !isValid(local)) return local;
      // Another tab may have saved or cleared the slot since the initial read.
      await transaction(database, "readwrite", store => {
        const request = store.get(SAVE_SLOT);
        request.onsuccess = () => {
          if (request.result === undefined) store.put(local, SAVE_SLOT);
        };
        return request;
      });
      const migrated = await readFromDatabase(database);
      if (migrated === null || isValid(migrated)) {
        removeLocalSave(raw);
        return migrated;
      }
      return local;
    } catch (error) {
      console.warn("GameSave: storage read failed", error);
      return localSaveData(parseLocalSave(localSaveRaw()));
    }
  });
}

function retryable(error) {
  return ["AbortError", "InvalidStateError", "UnknownError"].includes(error?.name);
}

async function updateSlot(data, stillRelevant = () => true) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!stillRelevant()) return true;
    const database = await openDatabaseIfAvailable();
    if (!stillRelevant()) return true;
    if (!database) break;
    try {
      const raw = localSaveRaw();
      const local = parseLocalSave(raw);
      await transaction(database, "readwrite", store => {
        // A fallback awaiting cleanup must not overwrite this newer write.
        if (isFallbackSave(local)) store.put(local.fallbackId, SYNCED_FALLBACK_SLOT);
        return store.put(data, SAVE_SLOT);
      });
      removeLocalSave(raw);
      return true;
    } catch (error) {
      if (attempt === 0 && retryable(error)) continue;
      break;
    }
  }
  if (!stillRelevant()) return true;
  try {
    const fallbackId = globalThis.crypto.getRandomValues(new Uint32Array(4)).join("-");
    // A null payload keeps the deletion until IndexedDB can record it.
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ fallbackId, data }));
    return true;
  } catch (error) {
    console.warn("GameSave: storage write failed", error);
    return false;
  }
}

export function writeStoredGameSave(data) {
  // Capture this turn before a later action can mutate the live dungeon.
  let snapshot;
  try {
    snapshot = structuredClone(data);
  } catch (error) {
    if (error?.name !== "DataCloneError") throw error;
    // Older live records can contain callbacks that the previous JSON save omitted.
    snapshot = JSON.parse(JSON.stringify(data));
  }
  const write = ++latestWrite;
  return inOrder(() => updateSlot(snapshot, () => latestWrite === write));
}

export function discardStoredGameSave() {
  // Any older queued saves must not re-create this run after it ends.
  latestWrite++;
  return inOrder(() => updateSlot(null));
}
