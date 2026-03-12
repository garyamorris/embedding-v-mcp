import OpenAI from "openai";

export const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
export const RESPONSE_MODEL =
  process.env.OPENAI_RESPONSE_MODEL ?? "gpt-4.1-mini";

let client: OpenAI | null = null;

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY. Add it to .env.local before using the tool or embedding bots.",
    );
  }

  if (!client) {
    client = new OpenAI({ apiKey });
  }

  return client;
}
