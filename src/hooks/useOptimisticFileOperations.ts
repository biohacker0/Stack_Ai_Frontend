import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createKnowledgeBase, syncKnowledgeBase, deleteKBResource } from "@/lib/api/knowledgeBase";
import { FileItem } from "@/lib/types/file";
import { toast } from 'react-toastify';

interface OptimisticFileState {
  id: string;
  status: FileItem["status"];
  isOptimistic: boolean;
  originalStatus?: FileItem["status"];
}

export function useOptimisticFileOperations() {
  const queryClient = useQueryClient();

  // Helper to update file status in root cache optimistically
  const updateRootFileStatus = useCallback(
    (fileIds: string[], newStatus: FileItem["status"], isOptimistic: boolean = false) => {
      const rootQueryKey = ["drive-files", "root"];
      const currentData = queryClient.getQueryData<{ data: FileItem[] }>(rootQueryKey);
      
      if (!currentData?.data) return null;

      const previousData = { ...currentData };
      
      const updatedData = {
        ...currentData,
        data: currentData.data.map(file => {
          if (fileIds.includes(file.id)) {
            return {
              ...file,
              status: newStatus,
              // Store original status for rollback if this is optimistic
              ...(isOptimistic && { originalStatus: file.status })
            };
          }
          return file;
        })
      };

      queryClient.setQueryData(rootQueryKey, updatedData);
      return previousData;
    },
    [queryClient]
  );

  // Helper to rollback optimistic updates
  const rollbackRootFileStatus = useCallback(
    (fileIds: string[], previousData: { data: FileItem[] } | null) => {
      if (!previousData) return;
      
      const rootQueryKey = ["drive-files", "root"];
      queryClient.setQueryData(rootQueryKey, previousData);
    },
    [queryClient]
  );

  // Helper to get files that need their status normalized (pending -> indexed)
  const normalizeFileStatus = useCallback(
    (fileIds: string[]) => {
      const rootQueryKey = ["drive-files", "root"];
      const currentData = queryClient.getQueryData<{ data: FileItem[] }>(rootQueryKey);
      
      if (!currentData?.data) return;

      const updatedData = {
        ...currentData,
        data: currentData.data.map(file => {
          if (fileIds.includes(file.id) && file.status === "pending") {
            return {
              ...file,
              status: "indexed" as const
            };
          }
          return file;
        })
      };

      queryClient.setQueryData(rootQueryKey, updatedData);
    },
    [queryClient]
  );

  // Optimistic KB creation mutation
  const createKBMutation = useMutation({
    mutationKey: ["createKB"],
    mutationFn: async ({ 
      resourceIds, 
      files 
    }: { 
      resourceIds: string[]; 
      files: FileItem[] 
    }) => {
      const kbData = {
        name: `Knowledge Base ${new Date().toLocaleString()}`,
        description: "Created from Google Drive files",
        resource_ids: resourceIds,
      };

      console.log("Creating KB with data:", kbData);
      const kb = await createKnowledgeBase(kbData);

      console.log("KB created, triggering sync:", kb.id);
      await syncKnowledgeBase(kb.id);

      return { kb, resourceIds };
    },
    onMutate: async ({ resourceIds }) => {
      console.log("Optimistic KB creation: updating selected files to indexed");
      
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ["drive-files", "root"] });
      
      // Snapshot the previous value for rollback
      const previousData = updateRootFileStatus(resourceIds, "indexed", true);
      
      return { previousData, resourceIds };
    },
    onError: (error, variables, context) => {
      console.error("KB creation failed, rolling back optimistic updates:", error);
      
      if (context?.previousData) {
        rollbackRootFileStatus(context.resourceIds, context.previousData);
      }
      
      toast.error("Failed to create knowledge base. Please try again.", {
        autoClose: 5000,
        toastId: 'kb-creation-error'
      });
    },
    onSuccess: ({ kb, resourceIds }, { files }) => {
      console.log("KB creation successful:", kb.id);
      
      // Normalize any pending status to indexed (since we show pending as indexed)
      normalizeFileStatus(resourceIds);
      
      // Populate KB resources cache with initial data for polling
      const initialKBResources = resourceIds.map(id => {
        const file = files.find(f => f.id === id);
        return {
          id,
          name: file?.name || "",
          type: "file" as const,
          status: "pending" as const,
          indexed_at: new Date().toISOString()
        };
      });
      
      queryClient.setQueryData(["kb-resources", kb.id], { 
        data: initialKBResources 
      });
      console.log(`Populated KB resources cache with ${initialKBResources.length} files`);
      
      toast.success("Knowledge base created successfully!", {
        autoClose: 3000,
        toastId: 'kb-creation-success'
      });
    },
  });

  // Optimistic file deletion mutation
  const deleteFilesMutation = useMutation({
    mutationKey: ["deleteFiles"],
    mutationFn: async ({ 
      kbId, 
      fileIds, 
      files 
    }: { 
      kbId: string; 
      fileIds: string[]; 
      files: FileItem[] 
    }) => {
      // Delete each file (for root files, the resource_path is just the filename)
      const deletePromises = fileIds.map(async (fileId) => {
        const file = files.find(f => f.id === fileId);  
        if (!file) return;
        
        const resourcePath = `/${file.name}`; // Root level files
        return deleteKBResource(kbId, resourcePath);
      });

      await Promise.all(deletePromises);
      return { fileIds };
    },
    onMutate: async ({ fileIds }) => {
      console.log("Optimistic file deletion: updating files to show '-' status");
      
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["drive-files", "root"] });
      
      // Snapshot previous state and update to undefined status (shows as "-")
      const previousData = updateRootFileStatus(fileIds, undefined, true);
      
      return { previousData, fileIds };
    },
    onError: (error, variables, context) => {
      console.error("File deletion failed, rolling back optimistic updates:", error);
      
      if (context?.previousData) {
        rollbackRootFileStatus(context.fileIds, context.previousData);
      }
      
      toast.error("Failed to delete files. Please try again.", {
        autoClose: 5000,
        toastId: 'file-deletion-error'
      });
    },
    onSuccess: ({ fileIds }, { kbId }) => {
      console.log("File deletion successful for files:", fileIds);
      
      // Also remove from KB resources cache if it exists
      const kbQueryKey = ["kb-resources", kbId];
      const kbData = queryClient.getQueryData<{ data: FileItem[] }>(kbQueryKey);
      
      if (kbData?.data) {
        const filteredKBData = {
          ...kbData,
          data: kbData.data.filter(resource => !fileIds.includes(resource.id))
        };
        queryClient.setQueryData(kbQueryKey, filteredKBData);
        console.log(`Removed ${fileIds.length} files from KB resources cache`);
      }
      
      toast.success(`Successfully deleted ${fileIds.length} file(s)`, {
        autoClose: 3000,
        toastId: 'file-deletion-success'
      });
    },
  });

  // Optimistic KB creation function
  const createKnowledgeBaseOptimistic = useCallback(
    (resourceIds: string[], files: FileItem[]) => {
      if (resourceIds.length === 0) {
        console.warn("No files selected for KB creation");
        return;
      }

      console.log(`Creating KB optimistically with ${resourceIds.length} resources`);
      createKBMutation.mutate({ resourceIds, files });
    },
    [createKBMutation]
  );

  // Optimistic file deletion function
  const deleteFilesOptimistic = useCallback(
    (kbId: string, fileIds: string[], files: FileItem[]) => {
      if (fileIds.length === 0 || !kbId) {
        console.warn("No files selected for deletion or no KB ID");
        return;
      }

      console.log(`Deleting files optimistically: ${fileIds.length} files`);
      deleteFilesMutation.mutate({ kbId, fileIds, files });
    },
    [deleteFilesMutation]
  );

  // Check if any mutation is in progress
  const isAnyMutating = queryClient.isMutating();
  const isKBCreating = queryClient.isMutating({ mutationKey: ["createKB"] });
  const isFilesDeleting = queryClient.isMutating({ mutationKey: ["deleteFiles"] });

  return {
    // Functions
    createKnowledgeBaseOptimistic,
    deleteFilesOptimistic,
    
    // States
    isKBCreating: isKBCreating > 0,
    isFilesDeleting: isFilesDeleting > 0,
    isAnyMutating: isAnyMutating > 0,
    
    // Raw mutations for advanced usage
    createKBMutation,
    deleteFilesMutation,
  };
} 