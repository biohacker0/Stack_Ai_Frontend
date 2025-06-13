// Knowledge Base related types
export interface KnowledgeBase {
  id: string;
  name: string;
  created_at: string;
  is_empty: boolean;
}

export interface CreateKBRequest {
  name: string;
  description: string;
  resource_ids: string[];
}
