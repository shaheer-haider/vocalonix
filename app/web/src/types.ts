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
  stop(): void;
  end(): void;
  getState(): { connectionStatus: string };
  onStatusChange(
    callback: (status: string, text?: string, subtext?: string) => void,
  ): void;
  onCallStart(callback: () => void): void;
  onCallConnected(callback: (info?: unknown) => void): void;
  onCallDisconnected(callback: (info?: unknown) => void): void;
  onCallEnd(callback: () => void): void;
  onError(callback: (error: unknown) => void): void;
}

declare global {
  interface Window {
    DograhWidget?: DograhWidget;
  }
}

export interface Vertical {
  slug: string;
  label: string;
  status: "live" | "coming_soon";
  icon: string;
  serviceOptions: string[];
  intakeFields: Array<{
    name: string;
    label: string;
    type: "text" | "select" | "yes_no" | "multi_select" | "textarea";
    options?: string[];
    required?: boolean;
  }>;
  defaultServices: string[];
  defaultGreeting: string;
  tone: "warm" | "polished" | "restrained" | "clinical";
  suggestedCallerScripts: string[];
  emailCaseStudy: string;
  missedCallValue: number;
}

export interface DemoSession {
  id: string;
  vertical: string;
  status: string;
  businessName?: string | null;
  city?: string | null;
  services?: string[];
  bookingTool?: string | null;
  verticalAnswers?: Record<string, unknown>;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  demoMode?: "browser" | "phone" | null;
  voice?: string | null;
  workflowId?: number | null;
}

export interface DograhHealth {
  connected: boolean;
  turnEnabled: boolean;
  health: Record<string, unknown> | null;
}

export interface DemoStartResponse {
  workflowId: number;
  scriptUrl: string;
  token: string;
  apiEndpoint: string;
  durationSeconds: number;
  suggestedScripts: string[];
  agentName: string;
}
