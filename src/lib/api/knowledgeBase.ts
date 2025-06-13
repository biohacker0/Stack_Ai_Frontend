import { apiRequest } from "./client";
import { KnowledgeBase, CreateKBRequest } from "../types/knowledgeBase";
import { FileListResponse } from "../types/file";

export async function createKnowledgeBase(data: CreateKBRequest): Promise<KnowledgeBase> {
  return apiRequest("/knowledge-bases", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function syncKnowledgeBase(kb_id: string) {
  return apiRequest(`/knowledge-bases/${kb_id}/sync`, {
    method: "POST",
  });
}

export async function listKBResources(kb_id: string, resource_path: string = "/"): Promise<FileListResponse> {
  const params = `?resource_path=${encodeURIComponent(resource_path)}`;
  return apiRequest(`/knowledge-bases/${kb_id}/resources${params}`);
}

// Safe version that handles 404/500 errors gracefully for folder expansion
export async function listKBResourcesSafe(kb_id: string, resource_path: string = "/"): Promise<FileListResponse | null> {
  try {
    const params = `?resource_path=${encodeURIComponent(resource_path)}`;
    return await apiRequest(`/knowledge-bases/${kb_id}/resources${params}`);
  } catch (error: any) {
    // If the folder doesn't exist in KB (404) or server error (500), return null instead of throwing
    if (error.status === 404 || error.status === 500) {
      return null;
    }
    // Re-throw other errors (network issues, etc.)
    throw error;
  }
}

export async function deleteKBResource(kb_id: string, resource_path: string) {
  const params = `?resource_path=${encodeURIComponent(resource_path)}`;
  return apiRequest(`/knowledge-bases/${kb_id}/resources${params}`, {
    method: "DELETE",
  });
}
