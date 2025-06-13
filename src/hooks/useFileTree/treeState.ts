import { useState, useCallback } from "react";

export function useTreeState() {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());
  const [errorToastShown, setErrorToastShown] = useState<Set<string>>(new Set());
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [delayedPollingFolders, setDelayedPollingFolders] = useState<Set<string>>(new Set());

  // Collapse all folders - useful after deletion
  const collapseAllFolders = useCallback(() => {
    setExpandedFolders(new Set());
    setLoadingFolders(new Set());
    setErrorToastShown(new Set()); // Reset error toast tracking
  }, []);

  // Force refresh for optimistic updates
  const forceRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return {
    // State
    expandedFolders,
    loadingFolders,
    errorToastShown,
    refreshTrigger,
    delayedPollingFolders,
    
    // Setters
    setExpandedFolders,
    setLoadingFolders,
    setErrorToastShown,
    setRefreshTrigger,
    setDelayedPollingFolders,
    
    // Actions
    collapseAllFolders,
    forceRefresh,
  };
} 