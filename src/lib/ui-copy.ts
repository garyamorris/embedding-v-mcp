import type { EmbeddingGranularity } from "@/lib/demo-types";

export const uiCopy = {
  labels: {
    comparison: "Tool Retrieval vs Semantic Retrieval",
    toolBot: "Tool Bot",
    semanticBot: "Semantic Bot",
    semanticMap: "Semantic Map",
    question: "Question",
    retrievedEvidence: "Retrieved evidence",
    processTrace: "Process trace",
    setupIssue: "Setup issue",
    connectionIssue: "Connection issue",
    tlsIssue: "TLS issue",
  },
  metadata: {
    appTitle: "Tool Retrieval vs Semantic Retrieval",
    appDescription:
      "A lightweight support demo that compares explicit tool lookups with semantic retrieval.",
    mapTitle: "Semantic Map | Tool Retrieval vs Semantic Retrieval",
    mapDescription:
      "A visual explanation of the same semantic retrieval used by the comparison demo.",
  },
  comparePage: {
    hero: {
      kicker: "Tool Retrieval vs Semantic Retrieval",
      title: "See where retrieval diverges",
      body:
        "Run one business question through the same support corpus and compare how each path finds evidence.",
      cta: "Open Semantic Map",
      datasetLine:
        "11 support tickets, 6 enhancement candidates, and 4 incidents in the local demo corpus.",
    },
    sections: {
      suggestedQuestionsTitle: "Suggested questions",
      askTitle: "Launcher",
      askBody: "Send one question through both retrieval paths.",
      questionPlaceholder:
        "Ask about recurring pain points, implied improvements, or hidden reliability concerns.",
      compareLabel: "Latest result",
      compareTitle: "The answer changed because the evidence changed",
      compareBody:
        "Both bots start from the same dataset. The difference comes from how they retrieve supporting evidence.",
      submit: "Compare answers",
      clear: "Clear",
    },
    panels: {
      tool: {
        label: "Tool Bot",
        title: "Structured lookups only",
        subtitle: "Keyword search, tag filters, and exact-name lookups.",
        emptyTitle: "Waiting for a query",
        emptyBody: "This side answers only from explicit tool results.",
        loading: "Running tool lookups...",
      },
      semantic: {
        label: "Semantic Bot",
        title: "Meaning-based retrieval",
        subtitle: "Embeddings retrieve related evidence before the answer is drafted.",
        emptyTitle: "Waiting for a query",
        emptyBody: "This side ranks nearby meaning before drafting an answer.",
        loading: "Embedding the question and ranking evidence...",
      },
    },
  },
  semanticMapPage: {
    navBack: "Back to compare",
    title: "Semantic Map",
    intro:
      "Project the active question into the same semantic space used by the Semantic Bot, then inspect the evidence around it.",
    status: {
      dataset: "Records",
      view: "View",
      query: "Query",
      queryReady: "Projected",
      queryLoading: "Updating",
      queryWaiting: "Ready",
    },
    controls: {
      question: "Question",
      suggested: "Suggested questions",
      granularity: "Granularity",
      display: "Display",
      camera: "Camera",
      plane: "2D plane",
      overlays: "Overlays",
      projectQuery: "Project question",
      moreSettings: "More settings",
      hideSettings: "Hide settings",
      help: "How it works",
      showCentroids: "Show centroids",
      showExampleQueries: "Show example overlays",
      showLinks: "Show similarity links",
      autoRotate: "Auto-rotate",
      display3d: "3D",
      display2d: "2D",
      viewerHint:
        "Drag to rotate. Scroll to zoom. Nearby points represent more similar meaning.",
      planeHint:
        "Scroll to zoom and compare separation inside the projected plane.",
    },
    inspector: {
      title: "Inspector",
      selectedTab: "Selected",
      nearestTab: "Nearest",
      examplesTab: "Examples",
      selectedTitle: "Selected item",
      nearestTitle: "Nearest evidence",
      examplesTitle: "Example questions",
    },
    help: {
      title: "How it works",
      body:
        "The Semantic Bot retrieves from full embedding vectors. This map is a compact visual explanation of that space.",
      distanceTitle: "Distance",
      distanceBody:
        "Closer points usually represent closer meaning in the original embedding space.",
      projectionTitle: "Projection",
      projectionBody:
        "This view uses PCA, which preserves the broad structure of the embedding space.",
      granularityTitle: "Granularity",
      granularityBody:
        "Record, chunk, sentence, and field views change how much each source item is split into separate points.",
      retrievalTitle: "Retrieval",
      retrievalBody:
        "The plotted map is a view of the space, not the retrieval step itself.",
      close: "Close",
    },
    empty: {
      selectedItem: "Select a point to inspect it here.",
      nearestEvidence: "Project a question to rank nearby evidence.",
      nearbyQuestions:
        "Example overlays are off. Turn them on or choose one of the saved prompts.",
    },
    detail: {
      useQuestion: "Use this question",
      sourceLabel: "Source",
      customerLabel: "Customer",
      toneLabel: "Tone",
      centroidFamilyLabel: "Centroid family",
      segmentLabel: "Segment",
      pointCountLabel: "Centroid members",
      similarityLabel: "Similarity",
      coordinatesLabel: "Coordinates",
      plottedLabel: "Plotted points",
      modelLabel: "Embedding model",
    },
    viewer: {
      loading: "Embedding the corpus and building the map...",
      empty: "Run a query to place it in the embedding space.",
      exampleTag: "saved example question",
      queryTag: "active query",
    },
  },
  traces: {
    tool: {
      question: "Question",
      planning: "Tool planning",
      searchTerms: "Search terms",
      toolCalls: "Tool calls",
      matches: "Matches",
      answer: "Answer",
    },
    semantic: {
      question: "Question",
      embedding: "Embedding",
      similarityRanking: "Similarity ranking",
      relatedImprovements: "Related improvements",
      evidenceSet: "Evidence set",
      answer: "Answer",
    },
  },
} as const;

export function buildCompareMetric(
  toolMatches: number,
  semanticMatches: number,
) {
  return `Tool evidence ${toolMatches} / Semantic evidence ${semanticMatches}`;
}

export function formatEvidenceKind(kind: "support" | "enhancement" | "incident") {
  if (kind === "support") {
    return "Support";
  }

  if (kind === "enhancement") {
    return "Enhancement";
  }

  return "Incident";
}

export function formatMapKind(
  kind: "support" | "enhancement" | "incident" | "centroid" | "example" | "query",
) {
  if (kind === "support") {
    return "Support ticket";
  }

  if (kind === "enhancement") {
    return "Enhancement";
  }

  if (kind === "incident") {
    return "Incident";
  }

  if (kind === "centroid") {
    return "Centroid";
  }

  if (kind === "example") {
    return "Example question";
  }

  return "Query";
}

export function formatTraceTone(tone: "neutral" | "success" | "warning") {
  if (tone === "success") {
    return "Supported";
  }

  if (tone === "warning") {
    return "Limited";
  }

  return "Info";
}

export function getProjectionCopy() {
  return {
    detail:
      "PCA preserves broad structure across the dataset. The axes summarize the largest directions of variation.",
    title: "PCA",
  };
}

export function getGranularityCopy(granularity: EmbeddingGranularity) {
  if (granularity === "chunk") {
    return "Chunk view splits each record into a few semantic fragments for a more detailed map.";
  }

  if (granularity === "sentence") {
    return "Sentence view turns each sentence into a point, which exposes repeated patterns more clearly.";
  }

  if (granularity === "field") {
    return "Field view separates subject, summary, body, tags, and signals so structure by field is easier to inspect.";
  }

  return "Record view keeps one point per source item for the clearest high-level overview.";
}

export function getDisplayCopy(
  displayMode: "3d" | "2d",
  axisPair: "xy" | "xz" | "yz",
  cameraPreset: "isometric" | "front" | "side" | "top",
) {
  if (displayMode === "2d") {
    return `The ${axisPair.toUpperCase()} plane flattens one axis so pairwise separation is easier to inspect.`;
  }

  const label =
    cameraPreset === "front"
      ? "front"
      : cameraPreset === "side"
        ? "side"
        : cameraPreset === "top"
          ? "top"
          : "isometric";

  return `The 3D view uses a ${label} camera preset so depth and overlap are easier to read.`;
}
