import type { BotResult, EvidenceCard, TraceStep } from "@/lib/demo-types";
import { EMBEDDING_MODEL, RESPONSE_MODEL, getOpenAIClient } from "@/lib/openai";
import {
  cosineSimilarity,
  getEmbeddedCorpus,
  getQueryEmbedding,
  roundScore,
  stripEmbeddedRecord,
} from "@/lib/semantic-corpus";
import { uiCopy } from "@/lib/ui-copy";

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
            text: "You are Semantic Bot in a demo that compares tool-based retrieval with semantic retrieval. Use only the supplied evidence. Make cross-record connections, explain implied improvements, and keep the answer concise. Return two short paragraphs followed by a heading 'Priority improvements' and up to three bullet points.",
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
  const [queryEmbedding, corpus] = await Promise.all([
    getQueryEmbedding(query),
    getEmbeddedCorpus(),
  ]);
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
      title: uiCopy.traces.semantic.question,
      summary: "Took the same question, but treated it as a similarity-search problem instead of an exact-match search.",
      detail: query,
    },
    {
      title: uiCopy.traces.semantic.embedding,
      summary: `Embedded the query with ${EMBEDDING_MODEL}.`,
      detail:
        "The query vector is compared against the local support, enhancement, and incident corpus.",
      tone: "success",
    },
    {
      title: uiCopy.traces.semantic.similarityRanking,
      summary: `Ranked ${corpus.length} local records by cosine similarity and kept the closest evidence.`,
      items: ranked.slice(0, 5).map(stripEmbeddedRecord),
      tone: "success",
    },
    {
      title: uiCopy.traces.semantic.relatedImprovements,
      summary:
        "Retrieved related improvement ideas by semantic proximity, even when they were not named directly.",
      items: enhancementEvidence,
      tone: "success",
    },
    {
      title: uiCopy.traces.semantic.evidenceSet,
      summary: `Prepared ${retrieved.length} pieces of evidence across support tickets, enhancement candidates, and incidents.`,
      items: retrieved,
      tone: "success",
    },
    {
      title: uiCopy.traces.semantic.answer,
      summary:
        "Generated a response from the retrieved evidence.",
      tone: "success",
    },
  ];

  return {
    mode: "smart",
    answer,
    verdict: "Similarity-based retrieval connected related evidence across different wording.",
    limitation:
      "This path is still limited to the local demo dataset, but it can group related issues and implied improvements from nearby matches.",
    retrieved,
    trace,
  };
}

export function buildSmartBotError(error: unknown): BotResult {
  const message =
    error instanceof Error
      ? error.message
      : "The Semantic Bot could not complete the retrieval run.";
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
        "The Semantic Bot could not start because the model configuration is incomplete.",
      verdict: uiCopy.labels.setupIssue,
      limitation:
        "Set OPENAI_API_KEY in .env.local to enable embeddings and model-based synthesis for the Semantic Bot.",
      error: message,
      errorLabel: uiCopy.labels.setupIssue,
      retrieved: [],
      trace: [
        {
          title: uiCopy.traces.semantic.question,
          summary: "The request reached the Semantic Bot.",
        },
        {
          title: uiCopy.traces.semantic.embedding,
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
        "The Semantic Bot could not reach the OpenAI API because Node rejected the local TLS certificate chain.",
      verdict: uiCopy.labels.tlsIssue,
      limitation: detail,
      error: `${message}${nestedCode ? ` (${nestedCode})` : ""}`,
      errorLabel: uiCopy.labels.tlsIssue,
      retrieved: [],
      trace: [
        {
          title: uiCopy.traces.semantic.question,
          summary: "The request reached the Semantic Bot.",
        },
        {
          title: uiCopy.traces.semantic.embedding,
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
      "The Semantic Bot could not reach the OpenAI API, so semantic retrieval could not complete.",
    verdict: uiCopy.labels.connectionIssue,
    limitation:
      "The server could not complete the outbound OpenAI request. Expand the trace to see the exact connection error.",
    error: message,
    errorLabel: uiCopy.labels.connectionIssue,
    retrieved: [],
    trace: [
      {
        title: uiCopy.traces.semantic.question,
        summary: "The request reached the Semantic Bot.",
      },
      {
        title: uiCopy.traces.semantic.embedding,
        summary: "The embedding call could not be completed.",
        detail: message,
        tone: "warning",
      },
    ],
  };
}
