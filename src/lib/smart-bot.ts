import { enhancementCandidates, incidentSummaries, supportTickets } from "@/data/demo-data";
import type { BotResult, EvidenceCard, TraceStep } from "@/lib/demo-types";
import { EMBEDDING_MODEL, RESPONSE_MODEL, getOpenAIClient } from "@/lib/openai";

type EmbeddedRecord = EvidenceCard & {
  embedding: number[];
  searchableText: string;
};

const corpusRecords: Omit<EmbeddedRecord, "embedding">[] = [
  ...supportTickets.map((ticket) => ({
    id: ticket.id,
    kind: "support" as const,
    title: ticket.subject,
    summary: ticket.summary,
    snippet: ticket.body,
    tags: ticket.tags,
    searchableText: [
      "support ticket",
      `subject: ${ticket.subject}`,
      `customer: ${ticket.customer}`,
      `summary: ${ticket.summary}`,
      `body: ${ticket.body}`,
      `tags: ${ticket.tags.join(", ")}`,
    ].join("\n"),
  })),
  ...enhancementCandidates.map((candidate) => ({
    id: candidate.id,
    kind: "enhancement" as const,
    title: candidate.name,
    summary: candidate.summary,
    snippet: candidate.description,
    tags: candidate.tags,
    searchableText: [
      "enhancement candidate",
      `name: ${candidate.name}`,
      `summary: ${candidate.summary}`,
      `description: ${candidate.description}`,
      `signals: ${candidate.linkedSignals.join(", ")}`,
      `tags: ${candidate.tags.join(", ")}`,
    ].join("\n"),
  })),
  ...incidentSummaries.map((incident) => ({
    id: incident.id,
    kind: "incident" as const,
    title: incident.title,
    summary: incident.summary,
    snippet: incident.details,
    tags: incident.tags,
    searchableText: [
      "incident summary",
      `title: ${incident.title}`,
      `date: ${incident.date}`,
      `summary: ${incident.summary}`,
      `details: ${incident.details}`,
      `tags: ${incident.tags.join(", ")}`,
    ].join("\n"),
  })),
];

let embeddedCorpusPromise: Promise<EmbeddedRecord[]> | null = null;

function stripEmbeddedRecord(record: EmbeddedRecord & { score: number }): EvidenceCard {
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    summary: record.summary,
    snippet: record.snippet,
    tags: record.tags,
    score: record.score,
    matchedKeywords: record.matchedKeywords,
  };
}

function cosineSimilarity(left: number[], right: number[]) {
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

function roundScore(value: number) {
  return Math.round(value * 1000) / 1000;
}

async function getEmbeddedCorpus() {
  if (!embeddedCorpusPromise) {
    embeddedCorpusPromise = buildEmbeddedCorpus();
  }

  return embeddedCorpusPromise;
}

async function buildEmbeddedCorpus() {
  const client = getOpenAIClient();
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: corpusRecords.map((record) => record.searchableText),
  });

  return corpusRecords.map((record, index) => ({
    ...record,
    embedding: response.data[index].embedding,
  }));
}

async function generateAnswer(
  query: string,
  supportEvidence: EvidenceCard[],
  enhancementEvidence: EvidenceCard[],
  incidentEvidence: EvidenceCard[],
) {
  const client = getOpenAIClient();
  const evidencePayload = {
    support: supportEvidence.map(({ id, title, summary, tags, score }) => ({
      id,
      title,
      summary,
      tags,
      score,
    })),
    enhancements: enhancementEvidence.map(
      ({ id, title, summary, tags, score, snippet }) => ({
        id,
        title,
        summary,
        tags,
        score,
        description: snippet,
      }),
    ),
    incidents: incidentEvidence.map(({ id, title, summary, tags, score }) => ({
      id,
      title,
      summary,
      tags,
      score,
    })),
  };

  const response = await client.responses.create({
    model: RESPONSE_MODEL,
    max_output_tokens: 420,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: "You are the Smart Bot in a demo that contrasts literal retrieval with embedding-based retrieval. Use only the supplied evidence. Make cross-record connections, explain implied improvements, and keep the answer concise. Return two short paragraphs followed by a heading 'Priority improvements' and up to three bullet points.",
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `User question:\n${query}\n\nRetrieved evidence:\n${JSON.stringify(evidencePayload, null, 2)}`,
          },
        ],
      },
    ],
  });

  return response.output_text?.trim() || "No answer text was returned by the response model.";
}

export async function runSmartBot(query: string): Promise<BotResult> {
  const client = getOpenAIClient();
  const [queryEmbeddingResponse, corpus] = await Promise.all([
    client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: query,
    }),
    getEmbeddedCorpus(),
  ]);

  const queryEmbedding = queryEmbeddingResponse.data[0].embedding;
  const ranked = corpus
    .map((record) => ({
      ...record,
      score: roundScore(cosineSimilarity(queryEmbedding, record.embedding)),
    }))
    .sort((left, right) => right.score - left.score);

  const supportEvidence = ranked
    .filter((record) => record.kind === "support")
    .slice(0, 4)
    .map(stripEmbeddedRecord);
  const enhancementEvidence = ranked
    .filter((record) => record.kind === "enhancement")
    .slice(0, 3)
    .map(stripEmbeddedRecord);
  const incidentEvidence = ranked
    .filter((record) => record.kind === "incident")
    .slice(0, 2)
    .map(stripEmbeddedRecord);
  const retrieved = [...supportEvidence, ...enhancementEvidence, ...incidentEvidence];
  const answer = await generateAnswer(
    query,
    supportEvidence,
    enhancementEvidence,
    incidentEvidence,
  );

  const trace: TraceStep[] = [
    {
      title: "User query",
      summary: "Took the same question, but treated it as a meaning-search problem instead of a keyword-search problem.",
      detail: query,
    },
    {
      title: "Query embedding step",
      summary: `Embedded the query with ${EMBEDDING_MODEL}.`,
      detail:
        "The query vector is compared against the local support, enhancement, and incident corpus.",
      tone: "success",
    },
    {
      title: "Similarity search over support items",
      summary: `Ranked ${corpus.length} local records by cosine similarity and kept the closest evidence.`,
      items: ranked.slice(0, 5).map(stripEmbeddedRecord),
      tone: "success",
    },
    {
      title: "Matching enhancement candidates",
      summary:
        "Retrieved improvement ideas by semantic proximity, even though the query did not need to mention them by name.",
      items: enhancementEvidence,
      tone: "success",
    },
    {
      title: "Retrieved evidence",
      summary: `Prepared ${retrieved.length} pieces of evidence across support tickets, enhancement candidates, and incidents.`,
      items: retrieved,
      tone: "success",
    },
    {
      title: "Final answer",
      summary:
        "Generated a response from the retrieved evidence, focusing on root causes and implied improvements.",
      tone: "success",
    },
  ];

  return {
    mode: "smart",
    answer,
    verdict: "Semantic retrieval connected related evidence across different wording.",
    limitation:
      "The Smart Bot is still bounded by the local demo dataset, but it can cluster meaning and implied fixes much better than literal tools.",
    retrieved,
    trace,
  };
}

export function buildSmartBotError(error: unknown): BotResult {
  const message =
    error instanceof Error
      ? error.message
      : "The Smart Bot could not complete the semantic retrieval run.";
  const nestedCode =
    error instanceof Error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "cause" in error.cause &&
    typeof error.cause.cause === "object" &&
    error.cause.cause !== null &&
    "code" in error.cause.cause &&
    typeof error.cause.cause.code === "string"
      ? error.cause.cause.code
      : undefined;

  if (message.includes("OPENAI_API_KEY")) {
    return {
      mode: "smart",
      answer:
        "The Smart Bot could not run because the OpenAI-backed semantic retrieval path is not fully configured.",
      verdict: "Semantic path unavailable.",
      limitation:
        "Set OPENAI_API_KEY in .env.local to enable embeddings and model-based synthesis for the Smart Bot.",
      error: message,
      errorLabel: "Config issue",
      retrieved: [],
      trace: [
        {
          title: "User query",
          summary: "The request reached the Smart Bot.",
        },
        {
          title: "Query embedding step",
          summary: "The embedding call could not be completed.",
          detail: message,
          tone: "warning",
        },
      ],
    };
  }

  if (nestedCode === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY") {
    const detail =
      "Node could not validate the TLS issuer for api.openai.com. Start the app with system certificates enabled. The package scripts now do this with `node --use-system-ca`.";

    return {
      mode: "smart",
      answer:
        "The Smart Bot could not reach the OpenAI API because Node rejected the local TLS certificate chain.",
      verdict: "TLS connection issue.",
      limitation: detail,
      error: `${message}${nestedCode ? ` (${nestedCode})` : ""}`,
      errorLabel: "TLS issue",
      retrieved: [],
      trace: [
        {
          title: "User query",
          summary: "The request reached the Smart Bot.",
        },
        {
          title: "Query embedding step",
          summary: "The OpenAI request failed before embeddings were returned.",
          detail,
          tone: "warning",
        },
      ],
    };
  }

  return {
    mode: "smart",
    answer:
      "The Smart Bot could not reach the OpenAI API, so semantic retrieval could not complete.",
    verdict: "Connection issue.",
    limitation:
      "The server could not complete the outbound OpenAI request. Expand the trace to see the exact connection error.",
    error: message,
    errorLabel: "Connection issue",
    retrieved: [],
    trace: [
      {
        title: "User query",
        summary: "The request reached the Smart Bot.",
      },
      {
        title: "Query embedding step",
        summary: "The embedding call could not be completed.",
        detail: message,
        tone: "warning",
      },
    ],
  };
}
