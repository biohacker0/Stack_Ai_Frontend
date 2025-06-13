import { FileItem } from "@/lib/types/file";

// State Keys
export const SYNC_STATE_KEY = ["sync-state"];
export const DELETE_QUEUE_KEY = ["delete-queue"];
export const OPTIMISTIC_DELETE_REGISTRY_KEY = ["optimistic-delete-registry"];
export const OPTIMISTIC_UPDATE_COUNTER_KEY = ["optimistic-update-counter"];

// Types
export type SyncState = "idle" | "pending" | "synced";

export interface DeleteRequest {
  id: string;
  fileId: string;
  fileName: string;
  resourcePath: string;
  kbId: string;
  timestamp: number;
}

export interface SyncStateData {
  state: SyncState;
  kbId: string | null;
  lastUpdated: number;
}

export interface DeleteQueueData {
  queue: DeleteRequest[];
  processing: boolean;
  lastUpdated: number;
}

export interface OptimisticDeleteEntry {
  fileId: string;
  fileName: string;
  kbId: string;
  timestamp: number;
  locked: boolean;
}

export interface OptimisticDeleteRegistryData {
  entries: Record<string, OptimisticDeleteEntry>;
  lastUpdated: number;
} 