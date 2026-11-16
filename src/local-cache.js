const DATABASE = 'hsb-check-local';
const STORE = 'workspace';
const KEY = 'current';
let writeQueue = Promise.resolve();

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('当前浏览器不支持本地结单缓存')); return; }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, action) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      let result;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}

export async function loadCachedWorkspace() {
  await writeQueue;
  return withStore('readonly', store => store.get(KEY));
}

export function saveCachedWorkspace(snapshot) {
  // Serialise writes so a delayed import cannot restore data after Clear.
  const pending = writeQueue.catch(() => {}).then(() => withStore('readwrite', store => store.put(snapshot, KEY)));
  writeQueue = pending;
  return pending;
}
