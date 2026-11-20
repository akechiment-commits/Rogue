const DATABASE_NAME = "roguelike_dungeon";
const STORE_NAME = "saves";
const SAVE_SLOT = "current";
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

function parseLegacy(raw) {
  try { return raw == null ? null : JSON.parse(raw); } catch { return null; }
}

function legacySave() {
  try { return localStorage.getItem(LEGACY_KEY); } catch { return null; }
}

function removeLegacySave() {
  try {
    localStorage.removeItem(LEGACY_KEY);
    return true;
  } catch {
    return false;
  }
}

export function readStoredGameSave(isValid, { migrateLegacy = false } = {}) {
  return inOrder(async () => {
    const raw = legacySave();
    try {
      const database = await getDatabase();
      if (!database) return parseLegacy(raw);
      const stored = await readFromDatabase(database);
      if (stored !== undefined) {
        if (raw !== null && (stored === null || (migrateLegacy && isValid(stored)))) removeLegacySave();
        return stored;
      }

      const legacy = parseLegacy(raw);
      if (!migrateLegacy || !isValid(legacy)) return legacy;
      // Another tab may have saved or cleared the slot since the initial read.
      await transaction(database, "readwrite", store => {
        const request = store.get(SAVE_SLOT);
        request.onsuccess = () => {
          if (request.result === undefined) store.put(legacy, SAVE_SLOT);
        };
        return request;
      });
      const migrated = await readFromDatabase(database);
      if (migrated === null || isValid(migrated)) {
        removeLegacySave();
        return migrated;
      }
      return legacy;
    } catch (error) {
      console.warn("GameSave: storage read failed", error);
      return parseLegacy(raw);
    }
  });
}

function retryable(error) {
  return ["AbortError", "InvalidStateError", "UnknownError"].includes(error?.name);
}

async function updateSlot(operation, stillRelevant = () => true) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!stillRelevant()) return true;
    try {
      const database = await getDatabase();
      if (!stillRelevant()) return true;
      return await operation(database);
    } catch (error) {
      if (attempt === 0 && retryable(error)) continue;
      console.warn("GameSave: storage write failed", error);
      return false;
    }
  }
  return false;
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
  return inOrder(() => updateSlot(async database => {
    if (database) {
      await transaction(database, "readwrite", store => store.put(snapshot, SAVE_SLOT));
    } else {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(snapshot));
    }
    return true;
  }, () => latestWrite === write));
}

export function discardStoredGameSave() {
  // Any older queued saves must not re-create this run after it ends.
  latestWrite++;
  return inOrder(() => updateSlot(async database => {
    if (!database) return removeLegacySave();
    // The empty slot also prevents a legacy save from being imported after a clear.
    await transaction(database, "readwrite", store => store.put(null, SAVE_SLOT));
    removeLegacySave();
    return true;
  }));
}
