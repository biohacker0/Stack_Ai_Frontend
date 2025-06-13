import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createKnowledgeBase, syncKnowledgeBase } from "@/lib/api/knowledgeBase";
import { saveKBToStorage } from "@/lib/utils/localStorage";
import { deduplicateResourceIds } from "@/lib/utils/resourceDeduplication";
import type { FileItem } from "@/lib/types/file";
import type { KnowledgeBase } from "@/lib/types/knowledgeBase";
import { toast } from "react-toastify";

export function useKBCreation(
  setSyncPending: (kbId: string) => void,
  setSyncCompleted: (kbId: string) => void,
  updateKBResourcesCache: (kbId: string, updater: (prev: { data: FileItem[] } | undefined) => { data: FileItem[] }) => void,
  updateFolderStatusCache: (kbId: string, folderPath: string, updater: (prev: { data: FileItem[] } | undefined) => { data: FileItem[] }) => void,
  markFoldersAsOptimisticallyIndexed: (kbId: string, folderIds: string[], folderNameMap: Map<string, string>) => void,
  clearOptimisticFoldersForKB: (kbId: string) => void,
  updateQueueKBId: (oldKbId: string, newKbId: string) => void,
  setCurrentKB: (kb: KnowledgeBase | null) => void,
  setIndexedFolders: (folders: Array<{ folderPath: string; fileIds: string[] }>) => void,
  getFolderPathFromFileName: (fileName: string) => string,
  getAllDescendantFileIds: (parentFiles: FileItem[], allFiles: FileItem[]) => string[]
) {
  const queryClient = useQueryClient();

  // OPTIMISTIC KB CREATION WITH PREFETCHING
  const createKBMutation = useMutation({
    mutationKey: ["createKB"],
    mutationFn: async ({ resourceIds, files }: { resourceIds: string[]; files: FileItem[] }) => {
      const deduplicatedIds = deduplicateResourceIds(resourceIds, files);

      const kbData = {
        name: `Knowledge Base ${new Date().toLocaleString()}`,
        description: "Created from Google Drive files",
        resource_ids: deduplicatedIds,
      };

      const kb = await createKnowledgeBase(kbData);

      await syncKnowledgeBase(kb.id);

      return { kb, resourceIds: deduplicatedIds };
    },
    onMutate: async ({ resourceIds, files }) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ["drive-files", "root"] });

      // 1. Create temporary optimistic KB for immediate UI updates
      const optimisticKB: KnowledgeBase = {
        id: `temp-${Date.now()}`,
        name: `Knowledge Base ${new Date().toLocaleString()}`,
        created_at: new Date().toISOString(),
        is_empty: false,
      };

      // 2. Update state with optimistic KB
      setCurrentKB(optimisticKB);
      setSyncPending(optimisticKB.id);

      // 3. CACHE SEGREGATION: Separate cached vs uncached folders
      const cachedFolderFiles: Array<{ folderId: string; folderPath: string; fileIds: string[] }> = [];
      const uncachedFolderIds: string[] = [];
      let allCachedFileIds: string[] = [];

      // Process selected items to separate files from folders
      const selectedFolders = resourceIds.filter((id) => {
        const item = files.find((f) => f.id === id);
        return item?.type === "directory";
      });

      const selectedFiles = resourceIds.filter((id) => {
        const item = files.find((f) => f.id === id);
        return item?.type === "file";
      });

      // Add individual files to cached list
      allCachedFileIds.push(...selectedFiles);

      // Process folders: check cache status
      for (const folderId of selectedFolders) {
        const folderData = queryClient.getQueryData<{ data: FileItem[] }>(["drive-files", folderId]);

        if (folderData?.data && folderData.data.length > 0) {
          // CACHED folder - can apply immediate optimistic updates
          const folderPath = getFolderPathFromFileName(folderData.data[0].name);
          const fileIds = getAllDescendantFileIds(folderData.data, files);

          if (fileIds.length > 0) {
            cachedFolderFiles.push({ folderId, folderPath, fileIds });
            allCachedFileIds.push(...fileIds);
          }
        } else {
          // UNCACHED folder - needs background fetching
          uncachedFolderIds.push(folderId);
        }
      }

      // Store folder info for polling
      setIndexedFolders(cachedFolderFiles);

      // 4. IMMEDIATE OPTIMISTIC UPDATES for root files
      const immediateRootFiles = selectedFiles; // Individual files selected at root

      const immediateOptimisticKBResources = immediateRootFiles.map((fileId) => {
        const file = files.find((f) => f.id === fileId);
        return {
          id: fileId,
          name: file?.name || "",
          type: file?.type || ("file" as const),
          size: file?.size || 0,
          status: "indexed" as const, // Show as indexed immediately
          indexed_at: new Date().toISOString(),
        };
      });

      // IMMEDIATE cache update for root
      updateKBResourcesCache(optimisticKB.id, () => ({
        data: immediateOptimisticKBResources,
      }));

      // 5b. MARK SELECTED FOLDERS IN OPTIMISTIC FOLDER REGISTRY
      const selectedFolderIds = resourceIds.filter((id) => {
        const item = files.find((f) => f.id === id);
        return item?.type === "directory";
      });

      if (selectedFolderIds.length > 0) {
        // Create folder name map for registry
        const folderNameMap = new Map<string, string>();
        selectedFolderIds.forEach((folderId) => {
          const folderItem = files.find((f) => f.id === folderId);
          if (folderItem) {
            folderNameMap.set(folderId, folderItem.name);
          }
        });

        // Mark folders as optimistically indexed
        markFoldersAsOptimisticallyIndexed(optimisticKB.id, selectedFolderIds, folderNameMap);
      }

      // IMMEDIATE cache updates for cached folders
      cachedFolderFiles.forEach(({ folderPath, fileIds }) => {
        const folderOptimisticResources = fileIds.map((fileId) => {
          const file = files.find((f) => f.id === fileId);
          return {
            id: fileId,
            name: file?.name || "",
            type: "file" as const,
            size: file?.size || 0,
            status: "indexed" as const,
            indexed_at: new Date().toISOString(),
          };
        });

        updateFolderStatusCache(optimisticKB.id, folderPath, () => ({
          data: folderOptimisticResources,
        }));
      });

      // 6. BACKGROUND FETCHING - Fetch uncached folders in parallel and apply rolling updates
      if (uncachedFolderIds.length > 0) {
        // Start parallel fetching (don't await - let it run in background)
        Promise.all(
          uncachedFolderIds.map(async (folderId) => {
            try {
              const selectedItem = files.find((f) => f.id === folderId);
              if (!selectedItem) return;

              // Fetch folder contents
              const response = await queryClient.fetchQuery({
                queryKey: ["drive-files", folderId],
                queryFn: async () => {
                  const { listResources } = await import("@/lib/api/connections");
                  return listResources(folderId);
                },
                staleTime: 5 * 60 * 1000, // 5 minutes
              });

              const folderContents = response?.data || [];
              if (folderContents.length === 0) return;

              // Extract folder info
              const folderPath = getFolderPathFromFileName(folderContents[0].name);
              const fileIds = getAllDescendantFileIds(folderContents, files);

              if (fileIds.length > 0) {
                // ROLLING UPDATE - Apply optimistic status for this folder
                const rollingOptimisticResources = fileIds.map((fileId) => {
                  const file = files.find((f) => f.id === fileId);
                  return {
                    id: fileId,
                    name: file?.name || "",
                    type: "file" as const,
                    size: file?.size || 0,
                    status: "indexed" as const,
                    indexed_at: new Date().toISOString(),
                  };
                });

                updateFolderStatusCache(optimisticKB.id, folderPath, () => ({
                  data: rollingOptimisticResources,
                }));

                // Update cached folder files for polling
                cachedFolderFiles.push({ folderId, folderPath, fileIds });
              }
            } catch (error) {
              console.error(`❌ BACKGROUND: Failed to fetch folder contents for ${folderId}:`, error);
            }
          })
        ).then(() => {});
      }

      return {
        optimisticKB,
        resourceIds,
        previousKB: null, // Assuming no previous KB for now
        folderFiles: cachedFolderFiles, // Start with cached folders, will be updated by background fetching
        allFileIds: allCachedFileIds, // Start with cached files
      };
    },
    onSuccess: ({ kb, resourceIds }, variables, context) => {
      // Update sync state to synced with the real KB ID
      setSyncCompleted(kb.id);

      // Update any queued delete requests from temp KB ID to real KB ID
      if (context?.optimisticKB) {
        updateQueueKBId(context.optimisticKB.id, kb.id);
      }

      // Replace optimistic KB with real KB
      setCurrentKB(kb);

      // Save real KB to localStorage
      saveKBToStorage({
        id: kb.id,
        name: kb.name,
        created_at: kb.created_at,
      });

      // Transfer optimistic caches from temp ID to real KB ID
      if (context?.optimisticKB) {
        // Transfer root KB cache
        const optimisticRootData = queryClient.getQueryData(["kb-resources", context.optimisticKB.id]);
        if (optimisticRootData) {
          queryClient.setQueryData(["kb-resources", kb.id], optimisticRootData);
        }

        // Transfer optimistic folder registry from temp ID to real KB ID
        const selectedFolderIds = resourceIds.filter((id) => {
          const item = variables.files.find((f) => f.id === id);
          return item?.type === "directory";
        });

        if (selectedFolderIds.length > 0) {
          // Clear old entries with temp KB ID
          clearOptimisticFoldersForKB(context.optimisticKB.id);

          // Re-mark folders with real KB ID
          const folderNameMap = new Map<string, string>();
          selectedFolderIds.forEach((folderId) => {
            const folderItem = variables.files.find((f) => f.id === folderId);
            if (folderItem) {
              folderNameMap.set(folderId, folderItem.name);
            }
          });

          markFoldersAsOptimisticallyIndexed(kb.id, selectedFolderIds, folderNameMap);
        }

        // Transfer folder status caches
        if (context.folderFiles) {
          context.folderFiles.forEach(({ folderPath }) => {
            const optimisticFolderData = queryClient.getQueryData(["kb-file-status", context.optimisticKB.id, folderPath]);
            if (optimisticFolderData) {
              queryClient.setQueryData(["kb-file-status", kb.id, folderPath], optimisticFolderData);
            }
          });
        }

        // Clean up temporary caches
        queryClient.removeQueries({ queryKey: ["kb-resources", context.optimisticKB.id] });
        queryClient.removeQueries({
          predicate: (query) => {
            const [type, kbId] = query.queryKey;
            return type === "kb-file-status" && kbId === context.optimisticKB.id;
          },
        });
      }

      // Update indexed folders for polling with real KB ID
      if (context?.folderFiles) {
        setIndexedFolders(context.folderFiles);
      }

      toast.success("Knowledge base created successfully!", {
        autoClose: 3000,
        toastId: "kb-creation-success",
      });
    },
    onError: (error, variables, context) => {
      console.error("❌ KB CREATION FAILED:", error);

      // Revert all optimistic updates
      if (context?.optimisticKB) {
        // Reset KB state
        setCurrentKB(context.previousKB);
        setIndexedFolders([]);

        // Reset sync state
        setSyncCompleted(""); // Reset to idle
      }

      // Remove optimistic caches
      if (context?.optimisticKB) {
        queryClient.removeQueries({ queryKey: ["kb-resources", context.optimisticKB.id] });
        queryClient.removeQueries({
          predicate: (query) => {
            const [type, kbId] = query.queryKey;
            return type === "kb-file-status" && kbId === context.optimisticKB.id;
          },
        });
      }

      toast.error("Failed to create knowledge base. Please try again.", {
        autoClose: 5000,
        toastId: "kb-creation-error",
      });
    },
  });

  return {
    createKBMutation,
  };
}
