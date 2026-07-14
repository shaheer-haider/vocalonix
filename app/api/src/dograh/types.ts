export interface AgentSettings {
  agentName: string;
  businessName: string;
  greeting: string;
  prompt: string;
  closing: string;
  allowInterrupt: boolean;
  widgetButtonText: string;
  widgetColor: string;
}

export interface DograhWorkflowSummary {
  id: number;
  name: string;
  status: string;
}

export interface DograhWorkflow extends DograhWorkflowSummary {
  workflow_definition: Record<string, unknown>;
  workflow_uuid?: string | null;
}

export interface DograhDocument {
  id: number;
  document_uuid: string;
  filename: string;
  file_size_bytes: number;
  mime_type: string;
  processing_status: string;
  processing_error?: string | null;
  total_chunks: number;
  retrieval_mode?: string;
  created_at: string;
}

export interface DograhDocumentList {
  documents: DograhDocument[];
  total?: number;
}

export interface DograhUpload {
  upload_url: string;
  document_uuid: string;
  s3_key: string;
}

export interface DograhEmbedToken {
  token: string;
  is_active: boolean;
  settings: Record<string, unknown> | null;
}
