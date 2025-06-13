import { useState, useEffect } from "react";
import { getKBFromStorage } from "@/lib/utils/localStorage";
import { useKnowledgeBaseStatus } from "../useKnowledgeBaseStatus";
import { useKnowledgeBaseDeletion } from "../useKnowledgeBaseDeletion";
import { useDataManager } from "../useDataManager";
import type { KnowledgeBase } from "@/lib/types/knowledgeBase";

export function useKBState() {
  const [currentKB, setCurrentKB] = useState<KnowledgeBase | null>(() => {
    // Initialize from localStorage on mount
    const stored = getKBFromStorage();
    return stored ? { ...stored, is_empty: false } : null;
  });

  // Track indexed folders for polling
  const [indexedFolders, setIndexedFolders] = useState<Array<{ folderPath: string; fileIds: string[] }>>([]);

  // Load cache when KB is restored from localStorage
  useEffect(() => {
    if (currentKB?.id) {
      // Cache will be loaded by DataManager's useEffect
    }
  }, [currentKB?.id]);

  const hasKB = currentKB !== null;

  // Use DataManager for centralized state management
  const dataManager = useDataManager();

  // Poll KB status after creation - enable polling when we have a KB
  const {
    statusMap,
    statusCounts,
    allFilesSettled,
    isLoading: isPolling,
    shouldPoll,
  } = useKnowledgeBaseStatus({
    kbId: currentKB?.id || null,
    enabled: hasKB,
    indexedFolders: indexedFolders,
  });

  // Handle file deletion capabilities
  const { isDeleting: isActuallyDeleting, isFileDeleting, canDeleteFile, canDeleteFolder } = useKnowledgeBaseDeletion(currentKB?.id || null, statusMap);

  return {
    // State
    currentKB,
    setCurrentKB,
    hasKB,
    indexedFolders,
    setIndexedFolders,

    // Status polling
    statusMap,
    statusCounts,
    allFilesSettled,
    isPolling,
    shouldPoll,

    // Deletion capabilities
    isActuallyDeleting,
    isFileDeleting,
    canDeleteFile,
    canDeleteFolder,

    // Data manager (pass through all functions)
    ...dataManager,
  };
}
