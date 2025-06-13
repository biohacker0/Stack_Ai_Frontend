import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

export type SyncState = "idle" | "pending" | "synced";

interface SyncStateData {
  state: SyncState;
  kbId: string | null;
  lastUpdated: number;
}

const SYNC_STATE_KEY = ["sync-state"];

export function useSyncState() {
  const queryClient = useQueryClient();

  // Use useQuery to subscribe to cache changes
  const { data: syncStateData } = useQuery({
    queryKey: SYNC_STATE_KEY,
    queryFn: () => {
      // This won't actually run since we always have data
      return { state: "idle" as SyncState, kbId: null, lastUpdated: Date.now() };
    },
    initialData: { state: "idle" as SyncState, kbId: null, lastUpdated: Date.now() },
    staleTime: Infinity, // Never considered stale since we update via setQueryData
  });

  const { state: syncState, kbId: syncKbId } = syncStateData;

  // Update sync state
  const setSyncState = useCallback(
    (newState: SyncState, kbId: string | null = null) => {
      const currentData = queryClient.getQueryData<SyncStateData>(SYNC_STATE_KEY) || syncStateData;
      const newData: SyncStateData = {
        state: newState,
        kbId: kbId || currentData.kbId,
        lastUpdated: Date.now(),
      };

      queryClient.setQueryData(SYNC_STATE_KEY, newData);
    },
    [queryClient, syncStateData]
  );

  // Helper functions
  const isPending = syncState === "pending";
  const isSynced = syncState === "synced";
  const isIdle = syncState === "idle";

  // Reset sync state (for new KB creation)
  const resetSyncState = useCallback(() => {
    setSyncState("idle", null);
  }, [setSyncState]);

  // Set to pending (KB creation started)
  const setSyncPending = useCallback(
    (kbId: string) => {
      setSyncState("pending", kbId);
    },
    [setSyncState]
  );

  // Set to synced (all files settled)
  const setSyncCompleted = useCallback(() => {
    setSyncState("synced");
  }, [setSyncState]);

  return {
    syncState,
    syncKbId,
    isPending,
    isSynced,
    isIdle,
    setSyncState,
    resetSyncState,
    setSyncPending,
    setSyncCompleted,
  };
}
