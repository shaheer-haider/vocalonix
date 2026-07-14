export type View = "test" | "knowledge" | "settings";

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

export interface AgentResponse {
  workflow: {
    id: number;
    name: string;
    status: string;
  };
  settings: AgentSettings;
}

export interface DocumentItem {
  document_uuid: string;
  filename: string;
  file_size_bytes: number;
  processing_status: string;
  processing_error?: string | null;
  total_chunks: number;
  retrieval_mode?: string;
  created_at: string;
}

export interface WidgetResponse {
  workflowId: number;
  scriptUrl: string;
  snippet: string;
}

export interface DograhWidget {
  start(): void;
  end(): void;
  onStatusChange(callback: (status: string) => void): void;
  onError(callback: (error: unknown) => void): void;
}

declare global {
  interface Window {
    DograhWidget?: DograhWidget;
  }
}
