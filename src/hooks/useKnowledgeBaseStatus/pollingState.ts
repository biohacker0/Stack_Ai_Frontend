import { useState, useEffect, useCallback } from "react";

// Constants
const MAX_POLL_DURATION = 2 * 60 * 1000; // 2 minutes

interface UsePollingStateProps {
  kbId: string | null;
  enabled?: boolean;
}

export function usePollingState({ kbId, enabled = true }: UsePollingStateProps) {
  const [shouldPoll, setShouldPoll] = useState(true);
  const [pollingStartTime] = useState(Date.now());
  const [hasShownErrorToast, setHasShownErrorToast] = useState(false);

  // Don't poll for temporary/optimistic KB IDs
  const isTemporaryKB = kbId?.startsWith('temp-') || false;
  const shouldEnablePolling = enabled && !!kbId && !isTemporaryKB && shouldPoll;

  // Reset polling when KB changes
  useEffect(() => {
    if (kbId) {
      setShouldPoll(true);
      setHasShownErrorToast(false);
    }
  }, [kbId]);

  // Check if polling has timed out
  const checkPollingTimeout = useCallback(() => {
    const pollingDuration = Date.now() - pollingStartTime;
    if (pollingDuration > MAX_POLL_DURATION) {
      console.log("Polling timeout reached, stopping polling");
      setShouldPoll(false);
      return true;
    }
    return false;
  }, [pollingStartTime]);

  // Stop polling
  const stopPolling = useCallback((reason: string) => {
    console.log(`Stopping polling: ${reason}`);
    setShouldPoll(false);
  }, []);

  // Reset error toast state
  const resetErrorToast = useCallback(() => {
    setHasShownErrorToast(false);
  }, []);

  return {
    shouldPoll,
    shouldEnablePolling,
    hasShownErrorToast,
    setHasShownErrorToast,
    pollingStartTime,
    isTemporaryKB,
    checkPollingTimeout,
    stopPolling,
    resetErrorToast,
  };
} 