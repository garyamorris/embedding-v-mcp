import { NextResponse } from "next/server";

import type { EmbeddingGranularity, EmbeddingProjection } from "@/lib/demo-types";
import { buildEmbeddingMapPayload } from "@/lib/embedding-space";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim() ?? "";
  const rawGranularity = searchParams.get("granularity");
  const rawProjection = searchParams.get("projection");
  const rawCentroids = searchParams.get("centroids");
  const rawExamples = searchParams.get("examples");
  const granularity: EmbeddingGranularity =
    rawGranularity === "chunk" ||
    rawGranularity === "sentence" ||
    rawGranularity === "field"
      ? rawGranularity
      : "record";
  const projection: EmbeddingProjection =
    rawProjection === "umap" ? "umap" : "pca";
  const showCentroids =
    rawCentroids === "1" || rawCentroids === "true" || rawCentroids === "on";
  const showExampleQueries =
    rawExamples === "1" || rawExamples === "true" || rawExamples === "on";

  try {
    const payload = await buildEmbeddingMapPayload({
      granularity,
      projection,
      query,
      showExampleQueries,
      showCentroids,
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The embedding map could not be generated.";

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}
