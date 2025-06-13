const KB_STORAGE_KEY = "stackai_knowledge_base";
const CACHE_STORAGE_KEY = "stackai_cache_data";

export interface KBStorageData {
  id: string;
  name: string;
  created_at: string;
}

// Cache data structure for persistence
export interface CacheStorageData {
  kbId: string;
  timestamp: number;
  rootResources: { data: any[] } | null;
  folderStatuses: Record<string, { data: any[] }>;
  optimisticRegistry: Record<string, any>;
  optimisticFolderRegistry: Record<string, any>; // NEW: Store optimistic folder registry
  version: string; // For cache migration if needed
}

export function saveKBToStorage(kb: KBStorageData): void {
  try {
    localStorage.setItem(KB_STORAGE_KEY, JSON.stringify(kb));
  } catch (error) {
    console.error("Failed to save KB to localStorage:", error);
  }
}

export function getKBFromStorage(): KBStorageData | null {
  try {
    const stored = localStorage.getItem(KB_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error("Failed to get KB from localStorage:", error);
    return null;
  }
}

export function clearKBFromStorage(): void {
  try {
    localStorage.removeItem(KB_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear KB from localStorage:", error);
  }
}

export function hasStoredKB(): boolean {
  return getKBFromStorage() !== null;
}

// New: Cache persistence functions
export function saveCacheToStorage(cacheData: CacheStorageData): void {
  try {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cacheData));
    console.log(`💾 [Cache] Saved cache to localStorage for KB: ${cacheData.kbId}`);
  } catch (error) {
    console.error("Failed to save cache to localStorage:", error);
  }
}

export function getCacheFromStorage(): CacheStorageData | null {
  try {
    const stored = localStorage.getItem(CACHE_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    
    if (parsed) {
      // Check if cache is not too old (24 hours)
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      if (Date.now() - parsed.timestamp > maxAge) {
        console.log("📅 [Cache] Cache expired, clearing");
        clearCacheFromStorage();
        return null;
      }
      console.log(`📖 [Cache] Loaded cache from localStorage for KB: ${parsed.kbId}`);
    }
    
    return parsed;
  } catch (error) {
    console.error("Failed to get cache from localStorage:", error);
    return null;
  }
}

export function clearCacheFromStorage(): void {
  try {
    localStorage.removeItem(CACHE_STORAGE_KEY);
    console.log("🗑️ [Cache] Cleared cache from localStorage");
  } catch (error) {
    console.error("Failed to clear cache from localStorage:", error);
  }
}

export function updateCacheInStorage(updater: (prev: CacheStorageData | null) => CacheStorageData | null): void {
  try {
    const current = getCacheFromStorage();
    const updated = updater(current);
    
    if (updated) {
      saveCacheToStorage(updated);
    } else {
      clearCacheFromStorage();
    }
  } catch (error) {
    console.error("Failed to update cache in localStorage:", error);
  }
} 