import { enhancementCandidates, incidentSummaries, supportTickets } from "@/data/demo-data";
import type { EmbeddingGranularity, EvidenceCard, SupportTicket } from "@/lib/demo-types";
import { EMBEDDING_MODEL, getOpenAIClient } from "@/lib/openai";

export type EmbeddedRecord = EvidenceCard & {
  embedding: number[];
  searchableText: string;
};

type SemanticSeed = Omit<EmbeddedRecord, "embedding">;

const recordSeeds = buildRecordSeeds();
const chunkSeeds = buildChunkSeeds();
const sentenceSeeds = buildSentenceSeeds();
const fieldSeeds = buildFieldSeeds();
const semanticSeedsByGranularity: Record<EmbeddingGranularity, SemanticSeed[]> = {
  chunk: chunkSeeds,
  field: fieldSeeds,
  record: recordSeeds,
  sentence: sentenceSeeds,
};

const embeddedCorpusPromises = new Map<EmbeddingGranularity, Promise<EmbeddedRecord[]>>();
const queryEmbeddingPromises = new Map<string, Promise<number[]>>();

function sentenceParts(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function groupParts(parts: string[], size: number) {
  const groups: string[] = [];

  for (let index = 0; index < parts.length; index += size) {
    groups.push(parts.slice(index, index + size).join(" "));
  }

  return groups;
}

function buildSearchableText(lines: string[]) {
  return lines.filter(Boolean).join("\n");
}

function makeSeed({
  id,
  kind,
  searchableText,
  segmentLabel,
  snippet,
  sourceCustomer,
  sourceId,
  sourceTitle,
  sourceTone,
  summary,
  tags,
  title,
}: {
  id: string;
  kind: EmbeddedRecord["kind"];
  searchableText: string;
  segmentLabel: string;
  snippet: string;
  sourceCustomer?: string;
  sourceId: string;
  sourceTitle: string;
  sourceTone?: SupportTicket["tone"];
  summary: string;
  tags: string[];
  title: string;
}): SemanticSeed {
  return {
    id,
    kind,
    title,
    summary,
    snippet,
    tags,
    sourceCustomer,
    sourceId,
    sourceTitle,
    sourceTone,
    segmentLabel,
    searchableText,
  };
}

function makeSupportRecordSeed(ticket: (typeof supportTickets)[number]): SemanticSeed {
  return makeSeed({
    id: ticket.id,
    kind: "support",
    searchableText: buildSearchableText([
      "support ticket",
      `subject: ${ticket.subject}`,
      `customer: ${ticket.customer}`,
      `tone: ${ticket.tone}`,
      `summary: ${ticket.summary}`,
      `body: ${ticket.body}`,
      `tags: ${ticket.tags.join(", ")}`,
    ]),
    segmentLabel: "record",
    snippet: ticket.body,
    sourceCustomer: ticket.customer,
    sourceId: ticket.id,
    sourceTitle: ticket.subject,
    sourceTone: ticket.tone,
    summary: ticket.summary,
    tags: ticket.tags,
    title: ticket.subject,
  });
}

function makeEnhancementRecordSeed(
  candidate: (typeof enhancementCandidates)[number],
): SemanticSeed {
  return makeSeed({
    id: candidate.id,
    kind: "enhancement",
    searchableText: buildSearchableText([
      "enhancement candidate",
      `name: ${candidate.name}`,
      `summary: ${candidate.summary}`,
      `description: ${candidate.description}`,
      `signals: ${candidate.linkedSignals.join(", ")}`,
      `tags: ${candidate.tags.join(", ")}`,
    ]),
    segmentLabel: "record",
    snippet: candidate.description,
    sourceId: candidate.id,
    sourceTitle: candidate.name,
    summary: candidate.summary,
    tags: candidate.tags,
    title: candidate.name,
  });
}

function makeIncidentRecordSeed(
  incident: (typeof incidentSummaries)[number],
): SemanticSeed {
  return makeSeed({
    id: incident.id,
    kind: "incident",
    searchableText: buildSearchableText([
      "incident summary",
      `title: ${incident.title}`,
      `date: ${incident.date}`,
      `summary: ${incident.summary}`,
      `details: ${incident.details}`,
      `tags: ${incident.tags.join(", ")}`,
    ]),
    segmentLabel: "record",
    snippet: incident.details,
    sourceId: incident.id,
    sourceTitle: incident.title,
    summary: incident.summary,
    tags: incident.tags,
    title: incident.title,
  });
}

function buildRecordSeeds() {
  return [
    ...supportTickets.map(makeSupportRecordSeed),
    ...enhancementCandidates.map(makeEnhancementRecordSeed),
    ...incidentSummaries.map(makeIncidentRecordSeed),
  ];
}

function buildChunkSeeds() {
  return [
    ...supportTickets.flatMap((ticket) => {
      const bodyGroups = groupParts(sentenceParts(ticket.body), 2);

      return [
        makeSeed({
          id: `${ticket.id}::overview`,
          kind: "support",
          searchableText: buildSearchableText([
            "support chunk",
            `record id: ${ticket.id}`,
            `segment: overview`,
            `subject: ${ticket.subject}`,
            `summary: ${ticket.summary}`,
            `customer: ${ticket.customer}`,
            `tone: ${ticket.tone}`,
            `tags: ${ticket.tags.join(", ")}`,
          ]),
          segmentLabel: "overview",
          snippet: `${ticket.subject} ${ticket.summary}`,
          sourceCustomer: ticket.customer,
          sourceId: ticket.id,
          sourceTitle: ticket.subject,
          sourceTone: ticket.tone,
          summary: ticket.subject,
          tags: ticket.tags,
          title: `${ticket.id}: overview`,
        }),
        ...bodyGroups.map((group, index) =>
          makeSeed({
            id: `${ticket.id}::body-chunk-${index + 1}`,
            kind: "support",
            searchableText: buildSearchableText([
              "support chunk",
              `record id: ${ticket.id}`,
              `segment: body chunk ${index + 1}`,
              `subject: ${ticket.subject}`,
              `body chunk: ${group}`,
              `tags: ${ticket.tags.join(", ")}`,
            ]),
            segmentLabel: `body chunk ${index + 1}`,
            snippet: group,
            sourceCustomer: ticket.customer,
            sourceId: ticket.id,
            sourceTitle: ticket.subject,
            sourceTone: ticket.tone,
            summary: ticket.subject,
            tags: ticket.tags,
            title: `${ticket.id}: body chunk ${index + 1}`,
          }),
        ),
        makeSeed({
          id: `${ticket.id}::metadata`,
          kind: "support",
          searchableText: buildSearchableText([
            "support chunk",
            `record id: ${ticket.id}`,
            "segment: metadata",
            `customer: ${ticket.customer}`,
            `tone: ${ticket.tone}`,
            `tags: ${ticket.tags.join(", ")}`,
          ]),
          segmentLabel: "metadata",
          snippet: `${ticket.customer}. Tone: ${ticket.tone}. Tags: ${ticket.tags.join(", ")}`,
          sourceCustomer: ticket.customer,
          sourceId: ticket.id,
          sourceTitle: ticket.subject,
          sourceTone: ticket.tone,
          summary: ticket.subject,
          tags: ticket.tags,
          title: `${ticket.id}: metadata`,
        }),
      ];
    }),
    ...enhancementCandidates.flatMap((candidate) => {
      const descriptionGroups = groupParts(sentenceParts(candidate.description), 2);
      const signalGroups = groupParts(candidate.linkedSignals, 2);

      return [
        makeSeed({
          id: `${candidate.id}::overview`,
          kind: "enhancement",
          searchableText: buildSearchableText([
            "enhancement chunk",
            `record id: ${candidate.id}`,
            "segment: overview",
            `name: ${candidate.name}`,
            `summary: ${candidate.summary}`,
            `tags: ${candidate.tags.join(", ")}`,
          ]),
          segmentLabel: "overview",
          snippet: `${candidate.name}. ${candidate.summary}`,
          sourceId: candidate.id,
          sourceTitle: candidate.name,
          summary: candidate.name,
          tags: candidate.tags,
          title: `${candidate.id}: overview`,
        }),
        ...descriptionGroups.map((group, index) =>
          makeSeed({
            id: `${candidate.id}::description-chunk-${index + 1}`,
            kind: "enhancement",
            searchableText: buildSearchableText([
              "enhancement chunk",
              `record id: ${candidate.id}`,
              `segment: description chunk ${index + 1}`,
              `name: ${candidate.name}`,
              `description chunk: ${group}`,
              `tags: ${candidate.tags.join(", ")}`,
            ]),
            segmentLabel: `description chunk ${index + 1}`,
            snippet: group,
            sourceId: candidate.id,
            sourceTitle: candidate.name,
            summary: candidate.name,
            tags: candidate.tags,
            title: `${candidate.id}: description chunk ${index + 1}`,
          }),
        ),
        ...signalGroups.map((group, index) =>
          makeSeed({
            id: `${candidate.id}::signal-chunk-${index + 1}`,
            kind: "enhancement",
            searchableText: buildSearchableText([
              "enhancement chunk",
              `record id: ${candidate.id}`,
              `segment: signal chunk ${index + 1}`,
              `name: ${candidate.name}`,
              `signals: ${group}`,
              `tags: ${candidate.tags.join(", ")}`,
            ]),
            segmentLabel: `signal chunk ${index + 1}`,
            snippet: group,
            sourceId: candidate.id,
            sourceTitle: candidate.name,
            summary: candidate.name,
            tags: candidate.tags,
            title: `${candidate.id}: signal chunk ${index + 1}`,
          }),
        ),
      ];
    }),
    ...incidentSummaries.flatMap((incident) => {
      const detailGroups = groupParts(sentenceParts(incident.details), 2);

      return [
        makeSeed({
          id: `${incident.id}::overview`,
          kind: "incident",
          searchableText: buildSearchableText([
            "incident chunk",
            `record id: ${incident.id}`,
            "segment: overview",
            `title: ${incident.title}`,
            `summary: ${incident.summary}`,
            `date: ${incident.date}`,
            `tags: ${incident.tags.join(", ")}`,
          ]),
          segmentLabel: "overview",
          snippet: `${incident.title}. ${incident.summary}`,
          sourceId: incident.id,
          sourceTitle: incident.title,
          summary: incident.title,
          tags: incident.tags,
          title: `${incident.id}: overview`,
        }),
        ...detailGroups.map((group, index) =>
          makeSeed({
            id: `${incident.id}::detail-chunk-${index + 1}`,
            kind: "incident",
            searchableText: buildSearchableText([
              "incident chunk",
              `record id: ${incident.id}`,
              `segment: detail chunk ${index + 1}`,
              `title: ${incident.title}`,
              `details: ${group}`,
              `tags: ${incident.tags.join(", ")}`,
            ]),
            segmentLabel: `detail chunk ${index + 1}`,
            snippet: group,
            sourceId: incident.id,
            sourceTitle: incident.title,
            summary: incident.title,
            tags: incident.tags,
            title: `${incident.id}: detail chunk ${index + 1}`,
          }),
        ),
      ];
    }),
  ];
}

function buildSentenceSeeds() {
  return [
    ...supportTickets.flatMap((ticket) => [
      makeSeed({
        id: `${ticket.id}::subject`,
        kind: "support",
        searchableText: buildSearchableText([
          "support sentence",
          `record id: ${ticket.id}`,
          "segment: subject",
          `subject: ${ticket.subject}`,
          `customer: ${ticket.customer}`,
          `tone: ${ticket.tone}`,
          `tags: ${ticket.tags.join(", ")}`,
        ]),
        segmentLabel: "subject",
        snippet: ticket.subject,
        sourceCustomer: ticket.customer,
        sourceId: ticket.id,
        sourceTitle: ticket.subject,
        sourceTone: ticket.tone,
        summary: ticket.subject,
        tags: ticket.tags,
        title: `${ticket.id}: subject`,
      }),
      makeSeed({
        id: `${ticket.id}::summary`,
        kind: "support",
        searchableText: buildSearchableText([
          "support sentence",
          `record id: ${ticket.id}`,
          "segment: summary",
          `summary: ${ticket.summary}`,
          `subject: ${ticket.subject}`,
          `tags: ${ticket.tags.join(", ")}`,
        ]),
        segmentLabel: "summary",
        snippet: ticket.summary,
        sourceCustomer: ticket.customer,
        sourceId: ticket.id,
        sourceTitle: ticket.subject,
        sourceTone: ticket.tone,
        summary: ticket.subject,
        tags: ticket.tags,
        title: `${ticket.id}: summary`,
      }),
      ...sentenceParts(ticket.body).map((part, index) =>
        makeSeed({
          id: `${ticket.id}::sentence-${index + 1}`,
          kind: "support",
          searchableText: buildSearchableText([
            "support sentence",
            `record id: ${ticket.id}`,
            `segment: sentence ${index + 1}`,
            `subject: ${ticket.subject}`,
            `sentence: ${part}`,
            `tags: ${ticket.tags.join(", ")}`,
          ]),
          segmentLabel: `sentence ${index + 1}`,
          snippet: part,
          sourceCustomer: ticket.customer,
          sourceId: ticket.id,
          sourceTitle: ticket.subject,
          sourceTone: ticket.tone,
          summary: ticket.subject,
          tags: ticket.tags,
          title: `${ticket.id}: sentence ${index + 1}`,
        }),
      ),
    ]),
    ...enhancementCandidates.flatMap((candidate) => [
      makeSeed({
        id: `${candidate.id}::name`,
        kind: "enhancement",
        searchableText: buildSearchableText([
          "enhancement sentence",
          `record id: ${candidate.id}`,
          "segment: name",
          `name: ${candidate.name}`,
          `tags: ${candidate.tags.join(", ")}`,
        ]),
        segmentLabel: "name",
        snippet: candidate.name,
        sourceId: candidate.id,
        sourceTitle: candidate.name,
        summary: candidate.name,
        tags: candidate.tags,
        title: `${candidate.id}: name`,
      }),
      makeSeed({
        id: `${candidate.id}::summary`,
        kind: "enhancement",
        searchableText: buildSearchableText([
          "enhancement sentence",
          `record id: ${candidate.id}`,
          "segment: summary",
          `summary: ${candidate.summary}`,
          `tags: ${candidate.tags.join(", ")}`,
        ]),
        segmentLabel: "summary",
        snippet: candidate.summary,
        sourceId: candidate.id,
        sourceTitle: candidate.name,
        summary: candidate.name,
        tags: candidate.tags,
        title: `${candidate.id}: summary`,
      }),
      ...sentenceParts(candidate.description).map((part, index) =>
        makeSeed({
          id: `${candidate.id}::description-sentence-${index + 1}`,
          kind: "enhancement",
          searchableText: buildSearchableText([
            "enhancement sentence",
            `record id: ${candidate.id}`,
            `segment: description sentence ${index + 1}`,
            `name: ${candidate.name}`,
            `sentence: ${part}`,
            `tags: ${candidate.tags.join(", ")}`,
          ]),
          segmentLabel: `description sentence ${index + 1}`,
          snippet: part,
          sourceId: candidate.id,
          sourceTitle: candidate.name,
          summary: candidate.name,
          tags: candidate.tags,
          title: `${candidate.id}: description sentence ${index + 1}`,
        }),
      ),
      ...candidate.linkedSignals.map((signal, index) =>
        makeSeed({
          id: `${candidate.id}::signal-${index + 1}`,
          kind: "enhancement",
          searchableText: buildSearchableText([
            "enhancement sentence",
            `record id: ${candidate.id}`,
            `segment: signal ${index + 1}`,
            `name: ${candidate.name}`,
            `signal: ${signal}`,
            `tags: ${candidate.tags.join(", ")}`,
          ]),
          segmentLabel: `signal ${index + 1}`,
          snippet: signal,
          sourceId: candidate.id,
          sourceTitle: candidate.name,
          summary: candidate.name,
          tags: candidate.tags,
          title: `${candidate.id}: signal ${index + 1}`,
        }),
      ),
    ]),
    ...incidentSummaries.flatMap((incident) => [
      makeSeed({
        id: `${incident.id}::title`,
        kind: "incident",
        searchableText: buildSearchableText([
          "incident sentence",
          `record id: ${incident.id}`,
          "segment: title",
          `title: ${incident.title}`,
          `tags: ${incident.tags.join(", ")}`,
        ]),
        segmentLabel: "title",
        snippet: incident.title,
        sourceId: incident.id,
        sourceTitle: incident.title,
        summary: incident.title,
        tags: incident.tags,
        title: `${incident.id}: title`,
      }),
      makeSeed({
        id: `${incident.id}::summary`,
        kind: "incident",
        searchableText: buildSearchableText([
          "incident sentence",
          `record id: ${incident.id}`,
          "segment: summary",
          `summary: ${incident.summary}`,
          `date: ${incident.date}`,
          `tags: ${incident.tags.join(", ")}`,
        ]),
        segmentLabel: "summary",
        snippet: incident.summary,
        sourceId: incident.id,
        sourceTitle: incident.title,
        summary: incident.title,
        tags: incident.tags,
        title: `${incident.id}: summary`,
      }),
      ...sentenceParts(incident.details).map((part, index) =>
        makeSeed({
          id: `${incident.id}::detail-sentence-${index + 1}`,
          kind: "incident",
          searchableText: buildSearchableText([
            "incident sentence",
            `record id: ${incident.id}`,
            `segment: detail sentence ${index + 1}`,
            `title: ${incident.title}`,
            `sentence: ${part}`,
            `tags: ${incident.tags.join(", ")}`,
          ]),
          segmentLabel: `detail sentence ${index + 1}`,
          snippet: part,
          sourceId: incident.id,
          sourceTitle: incident.title,
          summary: incident.title,
          tags: incident.tags,
          title: `${incident.id}: detail sentence ${index + 1}`,
        }),
      ),
    ]),
  ];
}

function buildFieldSeeds() {
  return [
    ...supportTickets.flatMap((ticket) => [
      makeSeed({
        id: `${ticket.id}::field-subject`,
        kind: "support",
        searchableText: buildSearchableText([
          "support field",
          `record id: ${ticket.id}`,
          "field: subject",
          `subject: ${ticket.subject}`,
        ]),
        segmentLabel: "field subject",
        snippet: ticket.subject,
        sourceCustomer: ticket.customer,
        sourceId: ticket.id,
        sourceTitle: ticket.subject,
        sourceTone: ticket.tone,
        summary: ticket.subject,
        tags: ticket.tags,
        title: `${ticket.id}: field subject`,
      }),
      makeSeed({
        id: `${ticket.id}::field-summary`,
        kind: "support",
        searchableText: buildSearchableText([
          "support field",
          `record id: ${ticket.id}`,
          "field: summary",
          `summary: ${ticket.summary}`,
        ]),
        segmentLabel: "field summary",
        snippet: ticket.summary,
        sourceCustomer: ticket.customer,
        sourceId: ticket.id,
        sourceTitle: ticket.subject,
        sourceTone: ticket.tone,
        summary: ticket.subject,
        tags: ticket.tags,
        title: `${ticket.id}: field summary`,
      }),
      makeSeed({
        id: `${ticket.id}::field-body`,
        kind: "support",
        searchableText: buildSearchableText([
          "support field",
          `record id: ${ticket.id}`,
          "field: body",
          `body: ${ticket.body}`,
        ]),
        segmentLabel: "field body",
        snippet: ticket.body,
        sourceCustomer: ticket.customer,
        sourceId: ticket.id,
        sourceTitle: ticket.subject,
        sourceTone: ticket.tone,
        summary: ticket.subject,
        tags: ticket.tags,
        title: `${ticket.id}: field body`,
      }),
      makeSeed({
        id: `${ticket.id}::field-customer`,
        kind: "support",
        searchableText: buildSearchableText([
          "support field",
          `record id: ${ticket.id}`,
          "field: customer context",
          `customer: ${ticket.customer}`,
          `tone: ${ticket.tone}`,
        ]),
        segmentLabel: "field customer",
        snippet: `${ticket.customer}. Tone: ${ticket.tone}.`,
        sourceCustomer: ticket.customer,
        sourceId: ticket.id,
        sourceTitle: ticket.subject,
        sourceTone: ticket.tone,
        summary: ticket.subject,
        tags: ticket.tags,
        title: `${ticket.id}: field customer`,
      }),
      makeSeed({
        id: `${ticket.id}::field-tags`,
        kind: "support",
        searchableText: buildSearchableText([
          "support field",
          `record id: ${ticket.id}`,
          "field: tags",
          `tags: ${ticket.tags.join(", ")}`,
        ]),
        segmentLabel: "field tags",
        snippet: ticket.tags.join(", "),
        sourceCustomer: ticket.customer,
        sourceId: ticket.id,
        sourceTitle: ticket.subject,
        sourceTone: ticket.tone,
        summary: ticket.subject,
        tags: ticket.tags,
        title: `${ticket.id}: field tags`,
      }),
    ]),
    ...enhancementCandidates.flatMap((candidate) => [
      makeSeed({
        id: `${candidate.id}::field-name`,
        kind: "enhancement",
        searchableText: buildSearchableText([
          "enhancement field",
          `record id: ${candidate.id}`,
          "field: name",
          `name: ${candidate.name}`,
        ]),
        segmentLabel: "field name",
        snippet: candidate.name,
        sourceId: candidate.id,
        sourceTitle: candidate.name,
        summary: candidate.name,
        tags: candidate.tags,
        title: `${candidate.id}: field name`,
      }),
      makeSeed({
        id: `${candidate.id}::field-summary`,
        kind: "enhancement",
        searchableText: buildSearchableText([
          "enhancement field",
          `record id: ${candidate.id}`,
          "field: summary",
          `summary: ${candidate.summary}`,
        ]),
        segmentLabel: "field summary",
        snippet: candidate.summary,
        sourceId: candidate.id,
        sourceTitle: candidate.name,
        summary: candidate.name,
        tags: candidate.tags,
        title: `${candidate.id}: field summary`,
      }),
      makeSeed({
        id: `${candidate.id}::field-description`,
        kind: "enhancement",
        searchableText: buildSearchableText([
          "enhancement field",
          `record id: ${candidate.id}`,
          "field: description",
          `description: ${candidate.description}`,
        ]),
        segmentLabel: "field description",
        snippet: candidate.description,
        sourceId: candidate.id,
        sourceTitle: candidate.name,
        summary: candidate.name,
        tags: candidate.tags,
        title: `${candidate.id}: field description`,
      }),
      makeSeed({
        id: `${candidate.id}::field-signals`,
        kind: "enhancement",
        searchableText: buildSearchableText([
          "enhancement field",
          `record id: ${candidate.id}`,
          "field: signals",
          `signals: ${candidate.linkedSignals.join(", ")}`,
        ]),
        segmentLabel: "field signals",
        snippet: candidate.linkedSignals.join(", "),
        sourceId: candidate.id,
        sourceTitle: candidate.name,
        summary: candidate.name,
        tags: candidate.tags,
        title: `${candidate.id}: field signals`,
      }),
      makeSeed({
        id: `${candidate.id}::field-tags`,
        kind: "enhancement",
        searchableText: buildSearchableText([
          "enhancement field",
          `record id: ${candidate.id}`,
          "field: tags",
          `tags: ${candidate.tags.join(", ")}`,
        ]),
        segmentLabel: "field tags",
        snippet: candidate.tags.join(", "),
        sourceId: candidate.id,
        sourceTitle: candidate.name,
        summary: candidate.name,
        tags: candidate.tags,
        title: `${candidate.id}: field tags`,
      }),
    ]),
    ...incidentSummaries.flatMap((incident) => [
      makeSeed({
        id: `${incident.id}::field-title`,
        kind: "incident",
        searchableText: buildSearchableText([
          "incident field",
          `record id: ${incident.id}`,
          "field: title",
          `title: ${incident.title}`,
        ]),
        segmentLabel: "field title",
        snippet: incident.title,
        sourceId: incident.id,
        sourceTitle: incident.title,
        summary: incident.title,
        tags: incident.tags,
        title: `${incident.id}: field title`,
      }),
      makeSeed({
        id: `${incident.id}::field-summary`,
        kind: "incident",
        searchableText: buildSearchableText([
          "incident field",
          `record id: ${incident.id}`,
          "field: summary",
          `summary: ${incident.summary}`,
        ]),
        segmentLabel: "field summary",
        snippet: incident.summary,
        sourceId: incident.id,
        sourceTitle: incident.title,
        summary: incident.title,
        tags: incident.tags,
        title: `${incident.id}: field summary`,
      }),
      makeSeed({
        id: `${incident.id}::field-details`,
        kind: "incident",
        searchableText: buildSearchableText([
          "incident field",
          `record id: ${incident.id}`,
          "field: details",
          `details: ${incident.details}`,
        ]),
        segmentLabel: "field details",
        snippet: incident.details,
        sourceId: incident.id,
        sourceTitle: incident.title,
        summary: incident.title,
        tags: incident.tags,
        title: `${incident.id}: field details`,
      }),
      makeSeed({
        id: `${incident.id}::field-date`,
        kind: "incident",
        searchableText: buildSearchableText([
          "incident field",
          `record id: ${incident.id}`,
          "field: date",
          `date: ${incident.date}`,
        ]),
        segmentLabel: "field date",
        snippet: incident.date,
        sourceId: incident.id,
        sourceTitle: incident.title,
        summary: incident.title,
        tags: incident.tags,
        title: `${incident.id}: field date`,
      }),
      makeSeed({
        id: `${incident.id}::field-tags`,
        kind: "incident",
        searchableText: buildSearchableText([
          "incident field",
          `record id: ${incident.id}`,
          "field: tags",
          `tags: ${incident.tags.join(", ")}`,
        ]),
        segmentLabel: "field tags",
        snippet: incident.tags.join(", "),
        sourceId: incident.id,
        sourceTitle: incident.title,
        summary: incident.title,
        tags: incident.tags,
        title: `${incident.id}: field tags`,
      }),
    ]),
  ];
}

export function getSourceRecordCount() {
  return recordSeeds.length;
}

export function stripEmbeddedRecord(
  record: EmbeddedRecord & Partial<Pick<EvidenceCard, "matchedKeywords" | "score">>,
): EvidenceCard {
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    summary: record.summary,
    snippet: record.snippet,
    tags: record.tags,
    sourceCustomer: record.sourceCustomer,
    sourceId: record.sourceId,
    sourceTitle: record.sourceTitle,
    sourceTone: record.sourceTone,
    segmentLabel: record.segmentLabel,
    score: record.score,
    matchedKeywords: record.matchedKeywords,
  };
}

export function cosineSimilarity(left: number[], right: number[]) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  if (!leftNorm || !rightNorm) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function roundScore(value: number) {
  return Math.round(value * 1000) / 1000;
}

export async function getEmbeddedCorpus(granularity: EmbeddingGranularity = "record") {
  const existing = embeddedCorpusPromises.get(granularity);

  if (existing) {
    return existing;
  }

  const promise = buildEmbeddedCorpus(granularity);
  embeddedCorpusPromises.set(granularity, promise);

  return promise;
}

export async function getQueryEmbedding(query: string) {
  const normalizedQuery = query.trim();
  const existing = queryEmbeddingPromises.get(normalizedQuery);

  if (existing) {
    return existing;
  }

  const client = getOpenAIClient();
  const promise = client.embeddings
    .create({
      model: EMBEDDING_MODEL,
      input: normalizedQuery,
    })
    .then((response) => response.data[0].embedding);

  queryEmbeddingPromises.set(normalizedQuery, promise);

  return promise;
}

async function buildEmbeddedCorpus(granularity: EmbeddingGranularity) {
  const seeds = semanticSeedsByGranularity[granularity];
  const client = getOpenAIClient();
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: seeds.map((record) => record.searchableText),
  });

  return seeds.map((record, index) => ({
    ...record,
    embedding: response.data[index].embedding,
  }));
}
