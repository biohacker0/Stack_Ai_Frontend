import { apiRequest } from "./client";
import { FileListResponse } from "../types/file";

export async function getConnectionInfo() {
  return apiRequest("/connections/info");
}

export async function listResources(resource_id?: string): Promise<FileListResponse> {
  const params = resource_id ? `?resource_id=${resource_id}` : "";
  return apiRequest(`/connections/resources${params}`);
}
