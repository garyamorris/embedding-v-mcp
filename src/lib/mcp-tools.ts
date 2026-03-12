import type { FunctionTool } from "openai/resources/responses/responses";

import { enhancementCandidates, incidentSummaries, supportTickets } from "@/data/demo-data";
import type { EvidenceCard } from "@/lib/demo-types";

const SUPPORT_TAGS = Array.from(
  new Set(supportTickets.flatMap((ticket) => ticket.tags)),
).sort();

interface SearchResult {
  item: EvidenceCard;
  hitCount: number;
}

export interface ToolExecutionResult {
  arguments: Record<string, unknown>;
  items: EvidenceCard[];
  resultCount: number;
  summary: string;
  toolName: string;
  toolOutput: {
    behavior: string;
    literalOnly: true;
    resultCount: number;
    results: Array<Record<string, unknown>>;
  };
}

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function snippet(text: string) {
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function countOccurrences(text: string, keyword: string) {
  if (!keyword) {
    return 0;
  }

  return text.split(keyword).length - 1;
}

function dedupeEvidence(items: EvidenceCard[]) {
  const map = new Map<string, EvidenceCard>();

  for (const item of items) {
    const key = `${item.kind}:${item.id}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, item);
      continue;
    }

    const mergedKeywords = Array.from(
      new Set([
        ...(existing.matchedKeywords ?? []),
        ...(item.matchedKeywords ?? []),
      ]),
    );

    map.set(key, {
      ...existing,
      matchedKeywords: mergedKeywords.length ? mergedKeywords : undefined,
    });
  }

  return Array.from(map.values());
}

function serializeCard(card: EvidenceCard, hitCount?: number) {
  return {
    id: card.id,
    kind: card.kind,
    title: card.title,
    summary: card.summary,
    snippet: card.snippet,
    tags: card.tags,
    ...(typeof hitCount === "number" ? { hitCount } : {}),
  };
}

function searchSupportByKeyword(keyword: string): SearchResult[] {
  const normalizedKeyword = normalize(keyword);

  if (!normalizedKeyword) {
    return [];
  }

  return supportTickets
    .flatMap((ticket) => {
      const searchable = normalize(
        `${ticket.subject} ${ticket.summary} ${ticket.body}`,
      );
      const hitCount = countOccurrences(searchable, normalizedKeyword);

      if (!hitCount) {
        return [];
      }

      return [
        {
          item: {
            id: ticket.id,
            kind: "support" as const,
            title: ticket.subject,
            summary: ticket.summary,
            snippet: snippet(ticket.body),
            tags: ticket.tags,
            matchedKeywords: [keyword],
          },
          hitCount,
        },
      ];
    })
    .sort((left, right) => right.hitCount - left.hitCount)
    .slice(0, 5);
}

function filterSupportByTag(tag: string): EvidenceCard[] {
  const normalizedTag = normalize(tag);

  return supportTickets
    .filter((ticket) => ticket.tags.includes(normalizedTag))
    .map((ticket) => ({
      id: ticket.id,
      kind: "support" as const,
      title: ticket.subject,
      summary: ticket.summary,
      snippet: snippet(ticket.body),
      tags: ticket.tags,
      matchedKeywords: [normalizedTag],
    }));
}

function getEnhancementByName(name: string): EvidenceCard[] {
  const normalizedName = normalize(name);

  return enhancementCandidates
    .filter((candidate) => normalize(candidate.name) === normalizedName)
    .map((candidate) => ({
      id: candidate.id,
      kind: "enhancement" as const,
      title: candidate.name,
      summary: candidate.summary,
      snippet: snippet(candidate.description),
      tags: candidate.tags,
      matchedKeywords: [name],
    }));
}

function searchIncidentsByKeyword(keyword: string): SearchResult[] {
  const normalizedKeyword = normalize(keyword);

  if (!normalizedKeyword) {
    return [];
  }

  return incidentSummaries
    .flatMap((incident) => {
      const searchable = normalize(
        `${incident.title} ${incident.summary} ${incident.details}`,
      );
      const hitCount = countOccurrences(searchable, normalizedKeyword);

      if (!hitCount) {
        return [];
      }

      return [
        {
          item: {
            id: incident.id,
            kind: "incident" as const,
            title: incident.title,
            summary: incident.summary,
            snippet: snippet(incident.details),
            tags: incident.tags,
            matchedKeywords: [keyword],
          },
          hitCount,
        },
      ];
    })
    .sort((left, right) => right.hitCount - left.hitCount)
    .slice(0, 5);
}

function asStringArgument(
  argumentsObject: Record<string, unknown>,
  key: string,
) {
  const value = argumentsObject[key];

  return typeof value === "string" ? value.trim() : "";
}

function ensureToolArguments(rawArguments: unknown) {
  if (!rawArguments || typeof rawArguments !== "object" || Array.isArray(rawArguments)) {
    return {} as Record<string, unknown>;
  }

  return rawArguments as Record<string, unknown>;
}

export const supportTags = SUPPORT_TAGS;

export function buildMcpToolDefinitions(): FunctionTool[] {
  return [
    {
      type: "function",
      name: "searchSupportByKeyword",
      description:
        "Literal keyword search over support ticket subject, summary, and body. Use exact words or short concrete phrases only. For broad questions, prefer several focused searches over one abstract phrase. No semantic matching or synonym expansion.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          keyword: {
            type: "string",
            description:
              "An exact keyword or short phrase to look for in support tickets.",
          },
        },
        required: ["keyword"],
      },
    },
    {
      type: "function",
      name: "filterSupportByTag",
      description:
        "Exact support-tag filter. Useful for broad questions when one or more listed tags look relevant to the problem area.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          tag: {
            type: "string",
            enum: SUPPORT_TAGS,
            description: "An exact support tag value.",
          },
        },
        required: ["tag"],
      },
    },
    {
      type: "function",
      name: "getEnhancementByName",
      description:
        "Retrieve an enhancement candidate by its exact name only. This is a literal lookup and returns nothing for partial or paraphrased names.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
            description: "The full exact enhancement candidate name.",
          },
        },
        required: ["name"],
      },
    },
    {
      type: "function",
      name: "searchIncidentsByKeyword",
      description:
        "Literal keyword search over incident title, summary, and details. Use exact words or short concrete phrases only. For broad questions, prefer several focused searches over one abstract phrase. No semantic matching or root-cause inference.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          keyword: {
            type: "string",
            description:
              "An exact keyword or short phrase to look for in incident summaries.",
          },
        },
        required: ["keyword"],
      },
    },
  ];
}

export function executeMcpTool(
  toolName: string,
  rawArguments: unknown,
): ToolExecutionResult {
  const argumentsObject = ensureToolArguments(rawArguments);

  if (toolName === "searchSupportByKeyword") {
    const keyword = asStringArgument(argumentsObject, "keyword");
    const results = searchSupportByKeyword(keyword);

    return {
      toolName,
      arguments: { keyword },
      items: dedupeEvidence(results.map((result) => result.item)),
      resultCount: results.length,
      summary: `searchSupportByKeyword("${keyword}") -> ${results.length} hit(s)`,
      toolOutput: {
        behavior:
          "Literal substring search over support ticket subject, summary, and body.",
        literalOnly: true,
        resultCount: results.length,
        results: results.map((result) => serializeCard(result.item, result.hitCount)),
      },
    };
  }

  if (toolName === "filterSupportByTag") {
    const tag = normalize(asStringArgument(argumentsObject, "tag"));
    const results = filterSupportByTag(tag);

    return {
      toolName,
      arguments: { tag },
      items: results,
      resultCount: results.length,
      summary: `filterSupportByTag("${tag}") -> ${results.length} hit(s)`,
      toolOutput: {
        behavior: "Exact tag filter over support tickets only.",
        literalOnly: true,
        resultCount: results.length,
        results: results.map((result) => serializeCard(result)),
      },
    };
  }

  if (toolName === "getEnhancementByName") {
    const name = asStringArgument(argumentsObject, "name");
    const results = getEnhancementByName(name);

    return {
      toolName,
      arguments: { name },
      items: results,
      resultCount: results.length,
      summary: `getEnhancementByName("${name}") -> ${results.length} hit(s)`,
      toolOutput: {
        behavior: "Exact enhancement-name lookup only.",
        literalOnly: true,
        resultCount: results.length,
        results: results.map((result) => serializeCard(result)),
      },
    };
  }

  if (toolName === "searchIncidentsByKeyword") {
    const keyword = asStringArgument(argumentsObject, "keyword");
    const results = searchIncidentsByKeyword(keyword);

    return {
      toolName,
      arguments: { keyword },
      items: dedupeEvidence(results.map((result) => result.item)),
      resultCount: results.length,
      summary: `searchIncidentsByKeyword("${keyword}") -> ${results.length} hit(s)`,
      toolOutput: {
        behavior:
          "Literal substring search over incident title, summary, and details.",
        literalOnly: true,
        resultCount: results.length,
        results: results.map((result) => serializeCard(result.item, result.hitCount)),
      },
    };
  }

  return {
    toolName,
    arguments: argumentsObject,
    items: [],
    resultCount: 0,
    summary: `${toolName}(...) -> unsupported tool`,
    toolOutput: {
      behavior: "Unsupported tool.",
      literalOnly: true,
      resultCount: 0,
      results: [],
    },
  };
}
