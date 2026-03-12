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

const DUMB_BOT_INSTRUCTIONS = `You are MCP Bot.

You are a typical MCP-style support assistant. Answer the user's questions as well as you can using the available MCP tools.

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
      verdict: "Tool agent found little exact evidence.",
      limitation:
        "This bot can only work through explicit tool calls with literal matching, so broad meaning-based questions still collapse into weak lookups.",
    };
  }

  if (!retrieved.some((item) => item.kind === "enhancement")) {
    return {
      verdict: "Tool agent found literal symptoms, but weak downstream recommendations.",
      limitation:
        "The tools can surface direct matches, but they still struggle to connect those matches to implied improvements unless an exact enhancement name is found.",
    };
  }

  return {
    verdict: "Tool agent answered from rigid tool outputs only.",
    limitation:
      "Even when it finds evidence, this bot is still bounded by exact tool behavior and cannot do semantic clustering across differently phrased tickets.",
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
      title: "User query",
      summary:
        "Sent the question to a tool-using model that could choose from a small MCP-style toolset.",
      detail: query,
    },
    {
      title: "Tool selection",
      summary: toolTrace.length
        ? `The model selected ${new Set(toolTrace.map((item) => item.toolName)).size} tool(s) and followed a procedural lookup path.`
        : "The model did not find a confident tool path before answering.",
      detail: Array.from(new Set(toolTrace.map((item) => item.toolName))).join("\n"),
    },
    {
      title: "Keyword extraction",
      summary:
        handles.keywords.length || handles.tags.length || handles.enhancementNames.length
          ? "The tool agent turned the question into literal tool arguments before retrieval."
          : "The tool agent did not settle on useful literal handles.",
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
      title: "Tool calls made",
      summary: toolTrace.length
        ? `Ran ${toolTrace.length} actual tool call(s).`
        : "No tool calls were executed.",
      detail: toolTrace.map((entry) => entry.summary).join("\n"),
    },
    {
      title: "Results found",
      summary: retrieved.length
        ? `Retrieved ${retrieved.length} literal evidence item(s).`
        : "No strong literal matches were found.",
      items: retrieved,
      tone: retrieved.length ? "neutral" : "warning",
    },
    {
      title: "Final answer",
      summary: evaluation.verdict,
      detail: evaluation.limitation,
      tone: retrieved.length ? "warning" : "warning",
    },
  ];

  return {
    mode: "dumb",
    answer:
      response.output_text.trim() ||
      "I could not produce a strong answer from the available literal tool outputs.",
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
      : "The tool-using bot could not complete its MCP-style retrieval flow.";
  const nestedCode = extractNestedCode(error);

  if (message.includes("OPENAI_API_KEY")) {
    return {
      mode: "dumb",
      answer:
        "The tool-using bot could not start because the OpenAI model needed to orchestrate the tools is not configured.",
      verdict: "Tool agent unavailable.",
      limitation:
        "Set OPENAI_API_KEY in .env.local to enable the tool-calling MCP comparison bot.",
      error: message,
      errorLabel: "Config issue",
      retrieved: [],
      trace: [
        {
          title: "User query",
          summary: "The request reached the tool-using bot.",
        },
        {
          title: "Tool selection",
          summary: "The model could not be initialized.",
          detail: message,
          tone: "warning",
        },
      ],
    };
  }

  if (nestedCode === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY") {
    const detail =
      "Node could not validate the TLS issuer for api.openai.com while the tool bot tried to call the OpenAI model. Start the app with system certificate support enabled.";

    return {
      mode: "dumb",
      answer:
        "The tool-using bot could not reach the OpenAI API because Node rejected the local TLS certificate chain.",
      verdict: "TLS connection issue.",
      limitation: detail,
      error: `${message} (${nestedCode})`,
      errorLabel: "TLS issue",
      retrieved: [],
      trace: [
        {
          title: "User query",
          summary: "The request reached the tool-using bot.",
        },
        {
          title: "Tool selection",
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
      "The tool-using bot could not complete its MCP-style retrieval flow because the model request failed.",
    verdict: "Connection issue.",
    limitation:
      "The tool bot now depends on an OpenAI model to choose and sequence tool calls, so outbound model failures block this path.",
    error: message,
    errorLabel: "Connection issue",
    retrieved: [],
    trace: [
      {
        title: "User query",
        summary: "The request reached the tool-using bot.",
      },
      {
        title: "Tool selection",
        summary: "The model call failed before tool execution completed.",
        detail: message,
        tone: "warning",
      },
    ],
  };
}
