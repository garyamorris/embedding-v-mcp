export type SourceKind = "support" | "enhancement" | "incident";
export type EmbeddingMapKind = SourceKind | "query" | "centroid" | "example";
export type EmbeddingGranularity = "record" | "chunk" | "sentence" | "field";
export type EmbeddingProjection = "pca";

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
  sourceId?: string;
  sourceCustomer?: string;
  sourceTone?: SupportTicket["tone"];
  sourceTitle?: string;
  segmentLabel?: string;
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

export interface EmbeddingMapNode {
  id: string;
  kind: EmbeddingMapKind;
  title: string;
  summary: string;
  snippet: string;
  tags: string[];
  overlayFamily?: string;
  sourceId?: string;
  sourceCustomer?: string;
  sourceTone?: SupportTicket["tone"];
  sourceTitle?: string;
  segmentLabel?: string;
  pointCount?: number;
  score?: number;
  x: number;
  y: number;
  z: number;
}

export interface EmbeddingMapLink {
  score: number;
  sourceId: string;
  targetId: string;
}

export interface RelatedQuery {
  id: string;
  query: string;
  score: number;
}

export interface EmbeddingMapPayload {
  centroidsEnabled: boolean;
  centroidBreakdown: Array<{
    count: number;
    family: string;
  }>;
  exampleQueriesEnabled: boolean;
  granularity: EmbeddingGranularity;
  relatedQueries: RelatedQuery[];
  model: string;
  nearest: EvidenceCard[];
  nodes: EmbeddingMapNode[];
  projection: EmbeddingProjection;
  projectionLabel: string;
  query: string;
  links: EmbeddingMapLink[];
  stats: {
    centroidPoints: number;
    exampleQueryPoints: number;
    plottedPoints: number;
    semanticPoints: number;
    sourceRecords: number;
    support: number;
    enhancements: number;
    incidents: number;
  };
}
