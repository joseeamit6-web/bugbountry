import { StudioProject } from '../types';

const DB_NAME = 'PhotoStudioDB_v1';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProjectToStorage(project: StudioProject): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = tx.objectStore(STORE_PROJECTS);
      const putReq = store.put({
        ...project,
        updatedAt: Date.now(),
      });
      putReq.onsuccess = () => {
        // Also save lightweight metadata to localStorage for instant check
        try {
          localStorage.setItem('photostudio_latest_draft_id', project.id);
          localStorage.setItem('photostudio_latest_draft_time', Date.now().toString());
          localStorage.setItem('photostudio_latest_draft_name', project.name);
        } catch {
          // ignore localStorage quota errors
        }
        resolve();
      };
      putReq.onerror = () => reject(putReq.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function loadLatestProjectFromStorage(): Promise<StudioProject | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.getAll();
      req.onsuccess = () => {
        const results = req.result as StudioProject[];
        if (!results || results.length === 0) {
          resolve(null);
          return;
        }
        // sort by updatedAt descending
        results.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        resolve(results[0]);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to load project from IndexedDB:', err);
    return null;
  }
}

export async function deleteProjectFromStorage(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.delete(id);
      req.onsuccess = () => {
        localStorage.removeItem('photostudio_latest_draft_id');
        localStorage.removeItem('photostudio_latest_draft_time');
        localStorage.removeItem('photostudio_latest_draft_name');
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to delete draft:', err);
  }
}

export async function clearAllDraftsFromStorage(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.clear();
      req.onsuccess = () => {
        localStorage.clear();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to clear drafts:', err);
  }
}
