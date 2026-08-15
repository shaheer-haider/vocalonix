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

export interface BusinessHoursDay {
  enabled: boolean;
  open: string;
  close: string;
}

export interface TenantAgentSettings {
  agentName: string;
  greeting: string;
  prompt: string;
  closing: string;
  tone: string;
  voice: string;
  allowInterrupt: boolean;
  escalationGuidance: string;
  /** Warm-transfer destination in E.164, or "" when transfers are off. */
  transferPhone: string;
  businessHours: Record<string, BusinessHoursDay>;
  widgetButtonText: string;
  widgetColor: string;
  allowedDomains: string[];
}

export interface DograhTool {
  id: number;
  tool_uuid: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  definition: Record<string, unknown>;
}

export interface DograhWorkflowSummary {
  id: number;
  name: string;
  status: string;
}

export interface DograhWorkflow extends DograhWorkflowSummary {
  workflow_definition: Record<string, unknown>;
  workflow_configurations?: Record<string, unknown> | null;
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

export interface DograhWorkflowRun {
  id: number;
  workflow_id: number;
  name: string;
  mode: string;
  is_completed: boolean;
  created_at: string;
  transcript_url?: string | null;
  recording_url?: string | null;
  transcript_public_url?: string | null;
  recording_public_url?: string | null;
  cost_info?: { call_duration_seconds?: number | null } | null;
  gathered_context?:
    | ({
        nodes_visited?: string[] | null;
        mapped_call_disposition?: string | null;
        call_disposition?: string | null;
      } & Record<string, unknown>)
    | null;
}

export interface DograhWorkflowRunsPage {
  runs: DograhWorkflowRun[];
  total_count: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface DograhModelConfiguration {
  configuration: Record<string, unknown> | null;
  effective_configuration: Record<string, unknown>;
  source: string;
}

export interface DograhTelephonyConfiguration {
  id: number;
  name: string;
  provider: string;
  is_default_outbound: boolean;
  phone_number_count?: number;
}

export interface DograhPhoneNumber {
  id: number;
  telephony_configuration_id: number;
  address: string;
  address_normalized: string;
  label?: string | null;
  inbound_workflow_id?: number | null;
  inbound_workflow_name?: string | null;
  is_active: boolean;
  provider_sync?: { ok: boolean; message?: string | null } | null;
}

export interface DograhEmbedToken {
  token: string;
  is_active: boolean;
  allowed_domains?: string[] | null;
  settings: Record<string, unknown> | null;
}
