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

/**
 * `idle` before a call, `connecting` while the session and WebRTC come up, then
 * `listening`/`speaking` alternating for the duration of the call.
 */
export type VoiceWidgetStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "ended"
  | "failed";

export interface VoiceWidget {
  start(): void;
  stop(): void;
  end(): void;
  open(): void;
  close(): void;
  getState(): { status: VoiceWidgetStatus; muted: boolean; open: boolean };
  onStatusChange(
    callback: (event: { status: VoiceWidgetStatus; detail: string }) => void,
  ): void;
  onCallStart(callback: () => void): void;
  onCallConnected(callback: (info?: unknown) => void): void;
  onCallDisconnected(callback: (info?: unknown) => void): void;
  onCallEnd(callback: () => void): void;
  onError(callback: (error: unknown) => void): void;
}

export interface VoiceCatalogueEntry {
  id: string;
  label: string;
  description: string;
  gender: "female" | "male";
  preview: string;
}

declare global {
  interface Window {
    VocalonixWidget?: VoiceWidget;
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

/** One line of the operator readiness panel. */
export interface PlatformCheck {
  id: string;
  label: string;
  state: "ready" | "attention" | "off";
  detail: string;
}

export interface PlatformStatus {
  callsReady: boolean;
  checks: PlatformCheck[];
  providers: {
    configured: boolean;
    mode: "pipeline" | "realtime" | null;
    summary: string | null;
    perBusinessVoice: boolean;
    reason?: string;
    missing?: string[];
    lastError?: string;
    lastSyncedAt?: string;
  };
  telephony: {
    configured: boolean;
    provider: "telnyx" | null;
    configId: number | null;
    reason?: string;
    lastError?: string;
  };
}

export interface BusinessPhoneNumber {
  id: string;
  e164: string;
  label: string;
  status: "pending" | "active" | "failed" | "released";
  lastError: string | null;
}

export interface BusinessPhoneResponse {
  numbers: BusinessPhoneNumber[];
  transferPhone: string;
  available: boolean;
  unavailableReason: string | null;
  voices: VoiceCatalogueEntry[];
  voiceSelectable: boolean;
  canManage: boolean;
  atNumberLimit: boolean;
}

/** A number on offer from the platform's provider account, not yet bought. */
export interface AvailableNumber {
  e164: string;
  locality: string | null;
  region: string | null;
  countryCode: string;
  monthlyCost: string | null;
  upfrontCost: string | null;
  currency: string | null;
}

/**
 * A plan as the API describes it. `null` on a limit means unlimited, which
 * keeps the wire format JSON-safe — Infinity has no representation there.
 */
export interface BillingPlan {
  id: string;
  name: string;
  amountCents: number;
  monthlyMinutes: number | null;
  phoneNumbers: number | null;
  seats: number | null;
}

export interface BillingStatus {
  configured: boolean;
  /** What the workspace is entitled to now, which is Free when a payment lapses. */
  plan: BillingPlan;
  status: string | null;
  periodEnd: string | null;
  usage: {
    minutesUsed: number;
    seatsUsed: number;
    windowStart: string;
  };
  /** Plans that can actually be bought on this deployment. */
  available: BillingPlan[];
}
