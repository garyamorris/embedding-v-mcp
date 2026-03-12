export type SourceKind = "support" | "enhancement" | "incident";

export interface SupportTicket {
  id: string;
  subject: string;
  customer: string;
  summary: string;
  body: string;
  tags: string[];
  tone: "curious" | "frustrated" | "worried";
}

export interface EnhancementCandidate {
  id: string;
  name: string;
  summary: string;
  description: string;
  tags: string[];
  linkedSignals: string[];
}

export interface IncidentSummary {
  id: string;
  title: string;
  date: string;
  summary: string;
  details: string;
  tags: string[];
}

export interface EvidenceCard {
  id: string;
  kind: SourceKind;
  title: string;
  summary: string;
  snippet: string;
  tags: string[];
  score?: number;
  matchedKeywords?: string[];
}

export interface TraceStep {
  title: string;
  summary: string;
  detail?: string;
  items?: EvidenceCard[];
  tone?: "neutral" | "success" | "warning";
}

export interface BotResult {
  mode: "dumb" | "smart";
  answer: string;
  verdict: string;
  limitation?: string;
  error?: string;
  errorLabel?: string;
  retrieved: EvidenceCard[];
  trace: TraceStep[];
}

export interface ComparisonSummary {
  headline: string;
  body: string;
}

export interface ComparePayload {
  query: string;
  dumb: BotResult;
  smart: BotResult;
  comparison: ComparisonSummary;
}
