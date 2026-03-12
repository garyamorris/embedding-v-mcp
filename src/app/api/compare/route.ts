import { NextResponse } from "next/server";

import { buildComparisonSummary } from "@/lib/compare-summary";
import { buildDumbBotError, runDumbBot } from "@/lib/dumb-bot";
import { buildSmartBotError, runSmartBot } from "@/lib/smart-bot";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Expected a JSON body with a query field." },
      { status: 400 },
    );
  }

  const query =
    typeof body === "object" &&
    body !== null &&
    "query" in body &&
    typeof body.query === "string"
      ? body.query.trim()
      : "";

  if (!query) {
    return NextResponse.json(
      { error: "Query is required." },
      { status: 400 },
    );
  }

  const [dumb, smart] = await Promise.all([
    runDumbBot(query).catch((error) => buildDumbBotError(error)),
    runSmartBot(query).catch((error) => buildSmartBotError(error)),
  ]);

  return NextResponse.json({
    query,
    dumb,
    smart,
    comparison: buildComparisonSummary(dumb, smart),
  });
}
