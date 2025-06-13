import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SYNC_STATE_KEY, SyncState, SyncStateData } from "./types";

export function useSyncState() {
  const queryClient = useQueryClient();

  const { data: syncStateData } = useQuery({
    queryKey: SYNC_STATE_KEY,
    queryFn: () => ({ state: "idle" as SyncState, kbId: null, lastUpdated: Date.now() }),
    initialData: { state: "idle" as SyncState, kbId: null, lastUpdated: Date.now() },
    staleTime: Infinity,
  });

  const updateSyncState = useCallback(
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

  return {
    syncStateData,
    updateSyncState,
  };
}
