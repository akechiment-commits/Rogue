/**
 * 画像（立ち絵・カスタムタイル等）を大容量保存するための IndexedDB ヘルパー。
 * LocalStorage の 5MB 容量制限を回避し、既存データの自動移行も行います。
 */

const DB_NAME = "roguelike_images";
const DB_VERSION = 1;
const STORE_NAME = "images";

let _dbPromise = null;

function getDb() {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => {
        console.warn("IndexedDB open failed, falling back to localStorage", e);
        resolve(null);
      };
    } catch (err) {
      console.warn("IndexedDB exception, falling back to localStorage", err);
      resolve(null);
    }
  });

  return _dbPromise;
}

/**
 * 画像データを保存
 * @param {string} key
 * @param {string} dataUrl
 * @returns {Promise<void>}
 */
export async function saveImage(key, dataUrl) {
  const db = await getDb();
  if (db) {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(dataUrl, key);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
      } catch (err) {
        reject(err);
      }
    });
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, dataUrl);
    }
  } catch (e) {
    console.warn("Fallback localStorage save failed", e);
  }
}

/**
 * 画像データを取得（LocalStorage からの自動移行を含む）
 * @param {string} key
 * @returns {Promise<string | null>}
 */
export async function loadImage(key) {
  const db = await getDb();
  if (db) {
    const fromIdb = await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    if (fromIdb) return fromIdb;

    // IndexedDB にない場合、LocalStorage からの自動移行を試みる
    try {
      if (typeof localStorage !== "undefined") {
        const fromLs = localStorage.getItem(key);
        if (fromLs) {
          await saveImage(key, fromLs);
          localStorage.removeItem(key);
          return fromLs;
        }
      }
    } catch {}

    return null;
  }

  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

/**
 * 画像データを削除（IndexedDB と LocalStorage の両方から削除）
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function deleteImage(key) {
  const db = await getDb();
  if (db) {
    await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
  } catch {}
}

/**
 * 指定プレフィックスで始まる全キーを取得
 * @param {string} prefix
 * @returns {Promise<string[]>}
 */
export async function listImageKeys(prefix = "") {
  const db = await getDb();
  const keys = new Set();

  if (db) {
    await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAllKeys();
        req.onsuccess = () => {
          for (const k of req.result || []) {
            if (typeof k === "string" && k.startsWith(prefix)) {
              keys.add(k);
            }
          }
          resolve();
        };
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  try {
    if (typeof localStorage !== "undefined") {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) {
          keys.add(k);
        }
      }
    }
  } catch {}

  return Array.from(keys);
}
