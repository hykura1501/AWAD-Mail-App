const DB_NAME = "mail-app-db";
const DB_VERSION = 1;
const STORE_NAME = "email_cache";

export const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
  });
};

export const saveToCache = async (key: string, data: any) => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({ key, data, timestamp: Date.now() });
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("Error saving to cache:", error);
  }
};

export const getFromCache = async (key: string): Promise<any | null> => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result ? request.result.data : null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Error reading from cache:", error);
    return null;
  }
};

// Get all cached email data from IndexedDB
export const getAllCachedEmails = async (): Promise<any[]> => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const results = request.result || [];
        // Extract emails from cache entries (format: { key, data: { emails, total }, timestamp })
        const allEmails: any[] = [];
        for (const entry of results) {
          if (entry.data?.emails && Array.isArray(entry.data.emails)) {
            allEmails.push(...entry.data.emails);
          }
        }
        resolve(allEmails);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Error getting all cached emails:", error);
    return [];
  }
};

// Get local suggestions from IndexedDB cached emails
// Returns unique sender names and subjects that match the query
export const getLocalSuggestions = async (query: string, limit: number = 5): Promise<string[]> => {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const queryLower = query.toLowerCase().trim();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 0);
  
  try {
    const emails = await getAllCachedEmails();
    const suggestions: string[] = [];
    const seen = new Set<string>();

    // Helper to check if text contains any query word
    const matchesQuery = (text: string): boolean => {
      const textLower = text.toLowerCase();
      return queryWords.some(word => textLower.includes(word));
    };

    for (const email of emails) {
      if (suggestions.length >= limit) break;

      // Add sender name if matches
      const fromName = email.from_name || email.fromName;
      if (fromName && !seen.has(fromName) && matchesQuery(fromName)) {
        suggestions.push(fromName);
        seen.add(fromName);
        if (suggestions.length >= limit) break;
      }

      // Add subject if matches
      const subject = email.subject;
      if (subject && !seen.has(subject) && matchesQuery(subject)) {
        suggestions.push(subject);
        seen.add(subject);
      }
    }

    return suggestions;
  } catch (error) {
    console.error("Error getting local suggestions:", error);
    return [];
  }
};

// Kanban column cache functions
const KANBAN_CACHE_PREFIX = "kanban-column-";

export const saveKanbanColumnToCache = async (columnId: string, emails: any[]) => {
  const key = `${KANBAN_CACHE_PREFIX}${columnId}`;
  await saveToCache(key, { emails, cachedAt: Date.now() });
};

export const getKanbanColumnFromCache = async (columnId: string): Promise<any[] | null> => {
  const key = `${KANBAN_CACHE_PREFIX}${columnId}`;
  const cached = await getFromCache(key);
  if (cached?.emails) {
    return cached.emails;
  }
  return null;
};

export const clearKanbanCache = async () => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    
    return new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const entries = request.result || [];
        for (const entry of entries) {
          if (entry.key?.startsWith(KANBAN_CACHE_PREFIX)) {
            store.delete(entry.key);
          }
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Error clearing kanban cache:", error);
  }
};

// ============================================
// AI Summary cache functions
// Stores summaries by email ID for instant display
// ============================================
const SUMMARY_CACHE_PREFIX = "summary-";

// Save a single summary to IndexedDB
export const saveSummaryToCache = async (emailId: string, summary: string) => {
  const key = `${SUMMARY_CACHE_PREFIX}${emailId}`;
  await saveToCache(key, { summary, cachedAt: Date.now() });
};

// Get a single summary from cache
export const getSummaryFromCache = async (emailId: string): Promise<string | null> => {
  const key = `${SUMMARY_CACHE_PREFIX}${emailId}`;
  const cached = await getFromCache(key);
  return cached?.summary || null;
};

// Get all cached summaries (for bulk loading)
export const getAllSummariesFromCache = async (): Promise<Record<string, string>> => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const entries = request.result || [];
        const summaries: Record<string, string> = {};
        for (const entry of entries) {
          if (entry.key?.startsWith(SUMMARY_CACHE_PREFIX) && entry.data?.summary) {
            const emailId = entry.key.replace(SUMMARY_CACHE_PREFIX, "");
            summaries[emailId] = entry.data.summary;
          }
        }
        resolve(summaries);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Error getting all cached summaries:", error);
    return {};
  }
};

// Save multiple summaries at once (batch operation)
export const saveSummariesToCache = async (summaries: Record<string, string>) => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    
    for (const [emailId, summary] of Object.entries(summaries)) {
      const key = `${SUMMARY_CACHE_PREFIX}${emailId}`;
      store.put({ key, data: { summary, cachedAt: Date.now() }, timestamp: Date.now() });
    }
    
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("Error saving summaries to cache:", error);
  }
};
