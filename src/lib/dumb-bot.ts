import type {
  ResponseFunctionToolCall,
  ResponseInputItem,
  ResponseOutputItem,
} from "openai/resources/responses/responses";

import type { BotResult, EvidenceCard, TraceStep } from "@/lib/demo-types";
import {
  buildMcpToolDefinitions,
  executeMcpTool,
  supportTags,
} from "@/lib/mcp-tools";
import { RESPONSE_MODEL, getOpenAIClient } from "@/lib/openai";
import { uiCopy } from "@/lib/ui-copy";

const DUMB_BOT_INSTRUCTIONS = `You are Tool Bot.

You are a support assistant that answers questions by using the available retrieval tools.

Rules:
- Always use tools before answering
- Use the tools as needed to gather relevant evidence
- For broad or abstract questions, try multiple focused keyword searches, relevant tag filters, and incident lookups before deciding the evidence is weak
- Synthesize patterns, priorities, and recommendations from the retrieved results when the question asks for them
- Stay grounded in the tool outputs and do not invent facts that were not retrieved
- If the evidence is incomplete or mixed, say so plainly
- Keep the final answer concise and practical`;

const MAX_TOOL_ROUNDS = 6;
const MAX_OUTPUT_TOKENS = 360;

interface ToolTrace {
  arguments: Record<string, unknown>;
  items: EvidenceCard[];
  summary: string;
  toolName: string;
}

function extractNestedCode(error: unknown) {
  if (
    error instanceof Error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "cause" in error.cause &&
    typeof error.cause.cause === "object" &&
    error.cause.cause !== null &&
    "code" in error.cause.cause &&
    typeof error.cause.cause.code === "string"
  ) {
    return error.cause.cause.code;
  }

  return undefined;
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

    map.set(key, {
      ...existing,
      matchedKeywords: Array.from(
        new Set([
          ...(existing.matchedKeywords ?? []),
          ...(item.matchedKeywords ?? []),
        ]),
      ),
    });
  }

  return Array.from(map.values());
}

function parseToolArguments(rawArguments: string) {
  try {
    const parsed = JSON.parse(rawArguments);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getFunctionCalls(output: ResponseOutputItem[]) {
  return output.filter(
    (item): item is ResponseFunctionToolCall => item.type === "function_call",
  );
}

function collectLiteralHandles(toolTrace: ToolTrace[]) {
  const keywordHandles = new Set<string>();
  const tagHandles = new Set<string>();
  const enhancementHandles = new Set<string>();

  for (const entry of toolTrace) {
    if (
      (entry.toolName === "searchSupportByKeyword" ||
        entry.toolName === "searchIncidentsByKeyword") &&
      typeof entry.arguments.keyword === "string" &&
      entry.arguments.keyword.trim()
    ) {
      keywordHandles.add(entry.arguments.keyword.trim());
    }

    if (
      entry.toolName === "filterSupportByTag" &&
      typeof entry.arguments.tag === "string" &&
      entry.arguments.tag.trim()
    ) {
      tagHandles.add(entry.arguments.tag.trim());
    }

    if (
      entry.toolName === "getEnhancementByName" &&
      typeof entry.arguments.name === "string" &&
      entry.arguments.name.trim()
    ) {
      enhancementHandles.add(entry.arguments.name.trim());
    }
  }

  return {
    keywords: Array.from(keywordHandles),
    tags: Array.from(tagHandles),
    enhancementNames: Array.from(enhancementHandles),
  };
}

function buildVerdict(retrieved: EvidenceCard[]) {
  if (!retrieved.length) {
    return {
      verdict: "Limited exact matches were found.",
      limitation:
        "This path depends on keyword, tag, and exact-name matches, so broad questions can return thin evidence.",
    };
  }

  if (!retrieved.some((item) => item.kind === "enhancement")) {
    return {
      verdict: "The tool path found symptoms more easily than related improvements.",
      limitation:
        "It can retrieve direct matches, but it does not infer related improvement ideas unless they are named or matched explicitly.",
    };
  }

  return {
    verdict: "The answer is grounded in explicit tool matches.",
    limitation:
      "This path stays within explicit tool outputs and does not group differently worded records by meaning.",
  };
}

export async function runDumbBot(query: string): Promise<BotResult> {
  const client = getOpenAIClient();
  const toolDefinitions = buildMcpToolDefinitions();
  const toolTrace: ToolTrace[] = [];
  const retrievedItems: EvidenceCard[] = [];

  let response = await client.responses.create({
    model: RESPONSE_MODEL,
    instructions: DUMB_BOT_INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: query,
          },
        ],
      },
    ],
    tools: toolDefinitions,
    tool_choice: "auto",
    temperature: 0,
    max_output_tokens: MAX_OUTPUT_TOKENS,
  });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const functionCalls = getFunctionCalls(response.output);

    if (!functionCalls.length) {
      break;
    }

    const toolOutputs: ResponseInputItem[] = functionCalls.map((call) => {
      const argumentsObject = parseToolArguments(call.arguments);
      const execution = executeMcpTool(call.name, argumentsObject);

      toolTrace.push({
        arguments: execution.arguments,
        items: execution.items,
        summary: execution.summary,
        toolName: execution.toolName,
      });
      retrievedItems.push(...execution.items);

      return {
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(execution.toolOutput),
      };
    });

    response = await client.responses.create({
      model: RESPONSE_MODEL,
      previous_response_id: response.id,
      instructions: DUMB_BOT_INSTRUCTIONS,
      input: toolOutputs,
      tools: toolDefinitions,
      tool_choice: "auto",
      temperature: 0,
      max_output_tokens: MAX_OUTPUT_TOKENS,
    });
  }

  const retrieved = dedupeEvidence(retrievedItems).slice(0, 6);
  const handles = collectLiteralHandles(toolTrace);
  const evaluation = buildVerdict(retrieved);
  const trace: TraceStep[] = [
    {
      title: uiCopy.traces.tool.question,
      summary:
        "Sent the question to a model that could choose from a small tool set.",
      detail: query,
    },
    {
      title: uiCopy.traces.tool.planning,
      summary: toolTrace.length
        ? `The model selected ${new Set(toolTrace.map((item) => item.toolName)).size} tool(s) and followed a structured lookup path.`
        : "The model did not settle on a strong tool plan before answering.",
      detail: Array.from(new Set(toolTrace.map((item) => item.toolName))).join("\n"),
    },
    {
      title: uiCopy.traces.tool.searchTerms,
      summary:
        handles.keywords.length || handles.tags.length || handles.enhancementNames.length
          ? "The question was translated into explicit search terms and filters before retrieval."
          : "No strong literal search terms or filters were selected.",
      detail: [
        `Available tag filters: ${supportTags.join(", ")}`,
        "Available enhancement lookup: exact name only",
        handles.keywords.length
          ? `Used keywords: ${handles.keywords.join(", ")}`
          : "Used keywords: none",
        handles.tags.length ? `Used tags: ${handles.tags.join(", ")}` : "Used tags: none",
        handles.enhancementNames.length
          ? `Used enhancement names: ${handles.enhancementNames.join(", ")}`
          : "Used enhancement names: none",
      ].join("\n"),
      tone:
        handles.keywords.length || handles.tags.length || handles.enhancementNames.length
          ? "neutral"
          : "warning",
    },
    {
      title: uiCopy.traces.tool.toolCalls,
      summary: toolTrace.length
        ? `Ran ${toolTrace.length} tool call(s).`
        : "No tool calls were executed.",
      detail: toolTrace.map((entry) => entry.summary).join("\n"),
    },
    {
      title: uiCopy.traces.tool.matches,
      summary: retrieved.length
        ? `Retrieved ${retrieved.length} exact-match evidence item(s).`
        : "No strong exact matches were found.",
      items: retrieved,
      tone: retrieved.length ? "neutral" : "warning",
    },
    {
      title: uiCopy.traces.tool.answer,
      summary: evaluation.verdict,
      detail: evaluation.limitation,
      tone: retrieved.length ? "warning" : "warning",
    },
  ];

  return {
    mode: "dumb",
    answer:
      response.output_text.trim() ||
      "I could not produce a strong answer from the available tool results.",
    verdict: evaluation.verdict,
    limitation: evaluation.limitation,
    retrieved,
    trace,
  };
}

export function buildDumbBotError(error: unknown): BotResult {
  const message =
    error instanceof Error
      ? error.message
      : "The Tool Bot could not complete the retrieval flow.";
  const nestedCode = extractNestedCode(error);

  if (message.includes("OPENAI_API_KEY")) {
    return {
      mode: "dumb",
      answer:
        "The Tool Bot could not start because the model configuration is incomplete.",
      verdict: uiCopy.labels.setupIssue,
      limitation:
        "Set OPENAI_API_KEY in .env.local to enable the Tool Bot.",
      error: message,
      errorLabel: uiCopy.labels.setupIssue,
      retrieved: [],
      trace: [
        {
          title: uiCopy.traces.tool.question,
          summary: "The request reached the Tool Bot.",
        },
        {
          title: uiCopy.traces.tool.planning,
          summary: "The model could not be initialized.",
          detail: message,
          tone: "warning",
        },
      ],
    };
  }

  if (nestedCode === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY") {
    const detail =
      "Node could not validate the TLS issuer for api.openai.com while the Tool Bot tried to call the model. Start the app with system certificate support enabled.";

    return {
      mode: "dumb",
      answer:
        "The Tool Bot could not reach the OpenAI API because Node rejected the local TLS certificate chain.",
      verdict: uiCopy.labels.tlsIssue,
      limitation: detail,
      error: `${message} (${nestedCode})`,
      errorLabel: uiCopy.labels.tlsIssue,
      retrieved: [],
      trace: [
        {
          title: uiCopy.traces.tool.question,
          summary: "The request reached the Tool Bot.",
        },
        {
          title: uiCopy.traces.tool.planning,
          summary: "The model call failed before any tool could be selected.",
          detail,
          tone: "warning",
        },
      ],
    };
  }

  return {
    mode: "dumb",
    answer:
      "The Tool Bot could not complete the retrieval flow because the model request failed.",
    verdict: uiCopy.labels.connectionIssue,
    limitation:
      "The Tool Bot depends on a model to choose and sequence tool calls, so outbound model failures block this path.",
    error: message,
    errorLabel: uiCopy.labels.connectionIssue,
    retrieved: [],
    trace: [
      {
        title: uiCopy.traces.tool.question,
        summary: "The request reached the Tool Bot.",
      },
      {
        title: uiCopy.traces.tool.planning,
        summary: "The model call failed before tool execution completed.",
        detail: message,
        tone: "warning",
      },
    ],
  };
}
