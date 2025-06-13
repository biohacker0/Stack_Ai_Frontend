import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  DELETE_QUEUE_KEY,
  DeleteQueueData,
  DeleteRequest 
} from "./types";

export function useDeleteQueue() {
  const queryClient = useQueryClient();

  const { data: queueData } = useQuery({
    queryKey: DELETE_QUEUE_KEY,
    queryFn: () => ({ queue: [], processing: false, lastUpdated: Date.now() }),
    initialData: { queue: [], processing: false, lastUpdated: Date.now() },
    staleTime: Infinity,
  });

  const updateQueueData = useCallback(
    (updater: (prev: DeleteQueueData) => DeleteQueueData) => {
      const currentData = queryClient.getQueryData<DeleteQueueData>(DELETE_QUEUE_KEY) || queueData;
      const newData = updater(currentData);
      queryClient.setQueryData(DELETE_QUEUE_KEY, newData);
      return newData;
    },
    [queryClient, queueData]
  );

  return {
    queueData,
    updateQueueData,
  };
} 