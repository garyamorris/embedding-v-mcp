import { UMAP } from "umap-js";

import { exampleQueries } from "@/data/demo-data";
import type {
  EmbeddingGranularity,
  EmbeddingMapNode,
  EmbeddingMapPayload,
  EmbeddingProjection,
  EvidenceCard,
} from "@/lib/demo-types";
import { EMBEDDING_MODEL } from "@/lib/openai";
import {
  cosineSimilarity,
  getEmbeddedCorpus,
  getQueryEmbedding,
  getSourceRecordCount,
  roundScore,
  stripEmbeddedRecord,
  type EmbeddedRecord,
} from "@/lib/semantic-corpus";

interface ProjectionSpace {
  corpusCoordinates: number[][];
  label: string;
  project: (vector: number[]) => number[];
}

interface CentroidSeed {
  embedding: number[];
  id: string;
  overlayFamily: string;
  pointCount: number;
  snippet: string;
  summary: string;
  tags: string[];
  title: string;
}

interface ExampleQuerySeed {
  embedding: number[];
  id: string;
  title: string;
}

const projectionCache = new Map<string, Promise<ProjectionSpace>>();
let embeddedExampleQueriesPromise: Promise<ExampleQuerySeed[]> | null = null;

function dot(left: number[], right: number[]) {
  let sum = 0;

  for (let index = 0; index < left.length; index += 1) {
    sum += left[index] * right[index];
  }

  return sum;
}

function norm(values: number[]) {
  return Math.sqrt(dot(values, values));
}

function scale(values: number[], scalar: number) {
  return values.map((value) => value * scalar);
}

function subtract(left: number[], right: number[]) {
  return left.map((value, index) => value - right[index]);
}

function orthogonalize(vector: number[], basis: number[][]) {
  const next = [...vector];

  for (const component of basis) {
    const projection = dot(next, component);

    for (let index = 0; index < next.length; index += 1) {
      next[index] -= projection * component[index];
    }
  }

  return next;
}

function seededVector(length: number, seed: number) {
  return Array.from({ length }, (_, index) =>
    Math.sin((index + 1) * (seed + 1) * 0.73) +
    Math.cos((index + 1) * (seed + 2) * 0.41),
  );
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function buildMean(vectors: number[][]) {
  const mean = new Array(vectors[0].length).fill(0);

  for (const vector of vectors) {
    for (let index = 0; index < vector.length; index += 1) {
      mean[index] += vector[index];
    }
  }

  for (let index = 0; index < mean.length; index += 1) {
    mean[index] /= vectors.length;
  }

  return mean;
}

function multiplyCovariance(centeredVectors: number[][], vector: number[]) {
  const output = new Array(vector.length).fill(0);

  for (const centered of centeredVectors) {
    const weight = dot(centered, vector);

    if (!weight) {
      continue;
    }

    for (let index = 0; index < output.length; index += 1) {
      output[index] += centered[index] * weight;
    }
  }

  return output;
}

function computePrincipalComponents(vectors: number[][], componentCount: number) {
  const mean = buildMean(vectors);
  const centeredVectors = vectors.map((vector) => subtract(vector, mean));
  const components: number[][] = [];

  for (let componentIndex = 0; componentIndex < componentCount; componentIndex += 1) {
    let candidate = seededVector(vectors[0].length, componentIndex + 1);
    candidate = orthogonalize(candidate, components);

    let candidateNorm = norm(candidate);

    if (!candidateNorm) {
      break;
    }

    candidate = scale(candidate, 1 / candidateNorm);

    for (let iteration = 0; iteration < 28; iteration += 1) {
      let next = multiplyCovariance(centeredVectors, candidate);
      next = orthogonalize(next, components);
      candidateNorm = norm(next);

      if (!candidateNorm) {
        break;
      }

      candidate = scale(next, 1 / candidateNorm);
    }

    components.push(candidate);
  }

  return { components, mean };
}

function vectorToCoordinate(vector: number[]) {
  return {
    x: vector[0] ?? 0,
    y: vector[1] ?? 0,
    z: vector[2] ?? 0,
  };
}

function normalizeCoordinates<T extends { x: number; y: number; z: number }>(
  points: T[],
  maxAbs: number,
) {
  const scaleBase = maxAbs || 0.0001;

  return points.map((point) => ({
    ...point,
    x: Math.round((point.x / scaleBase) * 1000) / 1000,
    y: Math.round((point.y / scaleBase) * 1000) / 1000,
    z: Math.round((point.z / scaleBase) * 1000) / 1000,
  }));
}

function averageEmbedding(vectors: number[][]) {
  const output = new Array(vectors[0].length).fill(0);

  for (const vector of vectors) {
    for (let index = 0; index < vector.length; index += 1) {
      output[index] += vector[index];
    }
  }

  for (let index = 0; index < output.length; index += 1) {
    output[index] /= vectors.length;
  }

  return output;
}

function buildGroupedCentroids({
  family,
  groupLabel,
  groups,
  minPoints = 2,
  minSources = 2,
}: {
  family: string;
  groupLabel: string;
  groups: Array<{
    key: string;
    records: EmbeddedRecord[];
  }>;
  minPoints?: number;
  minSources?: number;
}) {
  return groups
    .map(({ key, records }) => ({
      distinctSources: new Set(records.map((record) => record.sourceId ?? record.id)).size,
      key,
      records,
    }))
    .filter(
      ({ distinctSources, records }) =>
        records.length >= minPoints && distinctSources >= minSources,
    )
    .sort((left, right) => left.key.localeCompare(right.key))
    .map(
      ({ distinctSources, key, records }): CentroidSeed => ({
        id: `centroid:${family}:${key}`,
        overlayFamily: family,
        pointCount: records.length,
        title: `${groupLabel}: ${key}`,
        summary: `${records.length} semantic point(s) across ${distinctSources} source record(s) contribute to this centroid.`,
        snippet: `Average semantic position for ${groupLabel.toLowerCase()} ${key}. Nearby records or chunks tend to carry the same broad theme even when the wording differs.`,
        tags: Array.from(new Set(records.flatMap((record) => record.tags))).slice(0, 6),
        embedding: averageEmbedding(records.map((record) => record.embedding)),
      }),
    );
}

function buildTagCentroids(corpus: EmbeddedRecord[]) {
  const grouped = new Map<string, EmbeddedRecord[]>();

  for (const record of corpus) {
    for (const tag of record.tags) {
      const bucket = grouped.get(tag);

      if (bucket) {
        bucket.push(record);
      } else {
        grouped.set(tag, [record]);
      }
    }
  }

  return buildGroupedCentroids({
    family: "tag",
    groupLabel: "Tag centroid",
    groups: Array.from(grouped.entries()).map(([key, records]) => ({ key, records })),
  });
}

function buildKindCentroids(corpus: EmbeddedRecord[]) {
  const groups = ["support", "enhancement", "incident"].map((kind) => ({
    key: kind,
    records: corpus.filter((record) => record.kind === kind),
  }));

  return buildGroupedCentroids({
    family: "kind",
    groupLabel: "Source kind centroid",
    groups,
  });
}

function buildToneCentroids(corpus: EmbeddedRecord[]) {
  const grouped = new Map<string, EmbeddedRecord[]>();

  for (const record of corpus) {
    if (!record.sourceTone) {
      continue;
    }

    const bucket = grouped.get(record.sourceTone);

    if (bucket) {
      bucket.push(record);
    } else {
      grouped.set(record.sourceTone, [record]);
    }
  }

  return buildGroupedCentroids({
    family: "tone",
    groupLabel: "Tone centroid",
    groups: Array.from(grouped.entries()).map(([key, records]) => ({ key, records })),
  });
}

function buildCustomerCentroids(corpus: EmbeddedRecord[]) {
  const grouped = new Map<string, EmbeddedRecord[]>();

  for (const record of corpus) {
    if (!record.sourceCustomer) {
      continue;
    }

    const bucket = grouped.get(record.sourceCustomer);

    if (bucket) {
      bucket.push(record);
    } else {
      grouped.set(record.sourceCustomer, [record]);
    }
  }

  return buildGroupedCentroids({
    family: "customer",
    groupLabel: "Customer centroid",
    groups: Array.from(grouped.entries()).map(([key, records]) => ({ key, records })),
    minPoints: 2,
    minSources: 1,
  });
}

function buildCentroidSeeds(corpus: EmbeddedRecord[]) {
  return [
    ...buildTagCentroids(corpus),
    ...buildKindCentroids(corpus),
    ...buildToneCentroids(corpus),
    ...buildCustomerCentroids(corpus),
  ];
}

async function getEmbeddedExampleQueries() {
  if (embeddedExampleQueriesPromise) {
    return embeddedExampleQueriesPromise;
  }

  embeddedExampleQueriesPromise = Promise.all(
    exampleQueries.map(async (query, index) => ({
      embedding: await getQueryEmbedding(query),
      id: `example-query:${index + 1}`,
      title: query,
    })),
  );

  return embeddedExampleQueriesPromise;
}

async function getProjectionSpace(
  granularity: EmbeddingGranularity,
  projection: EmbeddingProjection,
) {
  const key = `${granularity}:${projection}`;
  const cached = projectionCache.get(key);

  if (cached) {
    return cached;
  }

  const promise = buildProjectionSpace(granularity, projection);
  projectionCache.set(key, promise);

  return promise;
}

async function buildProjectionSpace(
  granularity: EmbeddingGranularity,
  projection: EmbeddingProjection,
): Promise<ProjectionSpace> {
  const corpus = await getEmbeddedCorpus(granularity);
  const vectors = corpus.map((record) => record.embedding);

  if (projection === "umap") {
    const umap = new UMAP({
      minDist: granularity === "record" ? 0.18 : 0.11,
      nComponents: 3,
      nEpochs: 350,
      nNeighbors: Math.max(6, Math.min(18, Math.round(Math.sqrt(vectors.length)) + 3)),
      random: createSeededRandom(granularity === "record" ? 42 : 99),
      spread: 1.04,
    });
    const corpusCoordinates = umap.fit(vectors);

    return {
      corpusCoordinates,
      label: `3D UMAP projection of the ${granularity}-level embedding corpus`,
      project: (vector) => {
        const projected = umap.transform([vector])[0];
        return [projected[0] ?? 0, projected[1] ?? 0, projected[2] ?? 0];
      },
    };
  }

  const basis = computePrincipalComponents(vectors, 3);
  const corpusCoordinates = vectors.map((vector) =>
    basis.components.map((component) => dot(subtract(vector, basis.mean), component)),
  );

  return {
    corpusCoordinates,
    label: `3D PCA projection of the ${granularity}-level embedding corpus`,
    project: (vector) =>
      basis.components.map((component) => dot(subtract(vector, basis.mean), component)),
  };
}

function buildNode(
  point: Pick<
    EmbeddingMapNode,
    | "id"
    | "kind"
    | "overlayFamily"
    | "title"
    | "summary"
    | "snippet"
    | "tags"
    | "score"
    | "sourceCustomer"
    | "sourceId"
    | "sourceTitle"
    | "sourceTone"
    | "segmentLabel"
    | "pointCount"
  >,
  coordinates: { x: number; y: number; z: number },
): EmbeddingMapNode {
  return {
    ...point,
    x: coordinates.x,
    y: coordinates.y,
    z: coordinates.z,
  };
}

export async function buildEmbeddingMapPayload({
  granularity = "record",
  projection = "pca",
  query,
  showExampleQueries = false,
  showCentroids = false,
}: {
  granularity?: EmbeddingGranularity;
  projection?: EmbeddingProjection;
  query: string;
  showExampleQueries?: boolean;
  showCentroids?: boolean;
}): Promise<EmbeddingMapPayload> {
  const normalizedQueryText = query.trim();
  const [corpus, projectionSpace, queryEmbedding, exampleQuerySeeds] = await Promise.all([
    getEmbeddedCorpus(granularity),
    getProjectionSpace(granularity, projection),
    normalizedQueryText
      ? getQueryEmbedding(normalizedQueryText)
      : Promise.resolve<number[] | null>(null),
    showExampleQueries
      ? getEmbeddedExampleQueries()
      : Promise.resolve<ExampleQuerySeed[]>([]),
  ]);

  const ranked = queryEmbedding
    ? corpus
        .map((record) => ({
          ...record,
          score: roundScore(cosineSimilarity(queryEmbedding, record.embedding)),
        }))
        .sort((left, right) => right.score - left.score)
    : [];
  const scoreLookup = new Map(ranked.map((record) => [record.id, record.score]));

  const centroidSeeds = showCentroids ? buildCentroidSeeds(corpus) : [];
  const filteredExampleQueries = exampleQuerySeeds.filter(
    (item) => item.title.toLowerCase() !== normalizedQueryText.toLowerCase(),
  );
  const corpusCoordinates = projectionSpace.corpusCoordinates.map(vectorToCoordinate);
  const centroidCoordinates = centroidSeeds.map((centroid) => ({
    id: centroid.id,
    ...vectorToCoordinate(projectionSpace.project(centroid.embedding)),
  }));
  const exampleQueryCoordinates = filteredExampleQueries.map((item) => ({
    id: item.id,
    ...vectorToCoordinate(projectionSpace.project(item.embedding)),
  }));
  const queryCoordinate = queryEmbedding
    ? {
        id: "query-point",
        ...vectorToCoordinate(projectionSpace.project(queryEmbedding)),
      }
    : null;
  const projectionScale = [
    ...corpusCoordinates,
    ...centroidCoordinates,
    ...exampleQueryCoordinates,
    ...(queryCoordinate ? [queryCoordinate] : []),
  ].reduce((largest, point) => {
    return Math.max(largest, Math.abs(point.x), Math.abs(point.y), Math.abs(point.z));
  }, 0.0001);

  const normalizedCorpusCoordinates = normalizeCoordinates(
    corpusCoordinates.map((point, index) => ({
      id: corpus[index].id,
      ...point,
    })),
    projectionScale,
  );
  const normalizedCentroidCoordinates = normalizeCoordinates(
    centroidCoordinates,
    projectionScale,
  );
  const normalizedExampleQueryCoordinates = normalizeCoordinates(
    exampleQueryCoordinates,
    projectionScale,
  );
  const normalizedQueryCoordinate = queryCoordinate
    ? normalizeCoordinates([queryCoordinate], projectionScale)[0]
    : null;
  const coordinateLookup = new Map(
    [
      ...normalizedCorpusCoordinates,
      ...normalizedCentroidCoordinates,
      ...normalizedExampleQueryCoordinates,
      ...(normalizedQueryCoordinate ? [normalizedQueryCoordinate] : []),
    ].map((point) => [point.id, point]),
  );

  const nodes: EmbeddingMapNode[] = corpus.map((record) => {
    const point = coordinateLookup.get(record.id);
    const evidence = stripEmbeddedRecord(record);

    return buildNode(
      {
        ...evidence,
        score: scoreLookup.get(record.id),
      },
      {
        x: point?.x ?? 0,
        y: point?.y ?? 0,
        z: point?.z ?? 0,
      },
    );
  });

  if (normalizedQueryCoordinate) {
    nodes.push(
      buildNode(
        {
          id: normalizedQueryCoordinate.id,
          kind: "query",
          title: normalizedQueryText,
          summary: "Projected position of the active question in the same embedding space.",
          snippet:
            "Nearby points are the records or fragments with the closest semantic meaning to this question.",
          tags: [],
        },
        {
          x: normalizedQueryCoordinate.x,
          y: normalizedQueryCoordinate.y,
          z: normalizedQueryCoordinate.z,
        },
      ),
    );
  }

  const centroidNodes = centroidSeeds.map((centroid) => {
    const point = coordinateLookup.get(centroid.id);

    return buildNode(
      {
        id: centroid.id,
        kind: "centroid",
        overlayFamily: centroid.overlayFamily,
        title: centroid.title,
        summary: centroid.summary,
        snippet: centroid.snippet,
        tags: centroid.tags,
        pointCount: centroid.pointCount,
        score: queryEmbedding
          ? roundScore(cosineSimilarity(queryEmbedding, centroid.embedding))
          : undefined,
        segmentLabel: `${centroid.overlayFamily} centroid`,
      },
      {
        x: point?.x ?? 0,
        y: point?.y ?? 0,
        z: point?.z ?? 0,
      },
    );
  });
  nodes.push(...centroidNodes);
  const exampleNodes = filteredExampleQueries.map((item) => {
    const point = coordinateLookup.get(item.id);
    const score = queryEmbedding
      ? roundScore(cosineSimilarity(queryEmbedding, item.embedding))
      : undefined;

    return buildNode(
      {
        id: item.id,
        kind: "example",
        title: item.title,
        summary:
          "Saved demo question embedded into the same semantic space as the corpus and the active query.",
        snippet:
          "Use these nearby example questions to explain that semantically similar prompts land in similar neighborhoods even when they use different wording.",
        tags: ["example-query"],
        score,
      },
      {
        x: point?.x ?? 0,
        y: point?.y ?? 0,
        z: point?.z ?? 0,
      },
    );
  });
  nodes.push(...exampleNodes);

  const nearest: EvidenceCard[] = ranked.slice(0, 8).map(stripEmbeddedRecord);
  const centroidLinks =
    queryEmbedding && centroidNodes.length
      ? centroidNodes
          .filter((node) => typeof node.score === "number")
          .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
          .slice(0, 4)
          .map((node) => ({
            sourceId: "query-point",
            targetId: node.id,
            score: node.score ?? 0,
          }))
      : [];
  const exampleQueryLinks =
    queryEmbedding && exampleNodes.length
      ? exampleNodes
          .filter((node) => typeof node.score === "number")
          .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
          .slice(0, 3)
          .map((node) => ({
            sourceId: "query-point",
            targetId: node.id,
            score: node.score ?? 0,
          }))
      : [];
  const links = queryEmbedding
    ? [
        ...ranked.slice(0, 6).map((record) => ({
          sourceId: "query-point",
          targetId: record.id,
          score: record.score,
        })),
        ...centroidLinks,
        ...exampleQueryLinks,
      ]
    : [];
  const centroidBreakdown = Array.from(
    centroidNodes.reduce((map, node) => {
      const family = node.overlayFamily ?? "other";
      map.set(family, (map.get(family) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  ).map(([family, count]) => ({
    count,
    family,
  }));
  const relatedQueries = exampleNodes
    .filter((node) => typeof node.score === "number")
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, 4)
    .map((node) => ({
      id: node.id,
      query: node.title,
      score: node.score ?? 0,
    }));

  return {
    centroidsEnabled: showCentroids,
    centroidBreakdown,
    exampleQueriesEnabled: showExampleQueries,
    granularity,
    relatedQueries,
    model: EMBEDDING_MODEL,
    nearest,
    nodes,
    projection,
    projectionLabel: projectionSpace.label,
    query: normalizedQueryText,
    links,
    stats: {
      centroidPoints: centroidNodes.length,
      exampleQueryPoints: exampleNodes.length,
      plottedPoints: nodes.length,
      semanticPoints: corpus.length,
      sourceRecords: getSourceRecordCount(),
      support: corpus.filter((record) => record.kind === "support").length,
      enhancements: corpus.filter((record) => record.kind === "enhancement").length,
      incidents: corpus.filter((record) => record.kind === "incident").length,
    },
  };
}
