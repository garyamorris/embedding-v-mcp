"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { datasetStats, exampleQueries } from "@/data/demo-data";
import type {
  EmbeddingGranularity,
  EmbeddingMapPayload,
  EmbeddingProjection,
} from "@/lib/demo-types";
import {
  formatMapKind,
  getGranularityCopy,
  getProjectionCopy,
  uiCopy,
} from "@/lib/ui-copy";

import styles from "./embedding-space.module.css";

type CameraPreset = "isometric" | "front" | "side" | "top";
type DisplayMode = "3d" | "2d";
type AxisPair = "xy" | "xz" | "yz";
type InspectorTab = "selected" | "nearest" | "examples";

const EmbeddingSpaceViewer = dynamic(
  async () => (await import("./embedding-space-viewer")).EmbeddingSpaceViewer,
  {
    ssr: false,
    loading: () => (
      <div className={styles.viewerFallback}>
        <p>{uiCopy.semanticMapPage.viewer.loading}</p>
      </div>
    ),
  },
);

const GRANULARITY_OPTIONS: Array<{ label: string; value: EmbeddingGranularity }> = [
  { label: "Record", value: "record" },
  { label: "Chunk", value: "chunk" },
  { label: "Sentence", value: "sentence" },
  { label: "Field", value: "field" },
];

const CAMERA_OPTIONS: Array<{ label: string; value: CameraPreset }> = [
  { label: "Isometric", value: "isometric" },
  { label: "Front", value: "front" },
  { label: "Side", value: "side" },
  { label: "Top", value: "top" },
];

const AXIS_OPTIONS: Array<{ label: string; value: AxisPair }> = [
  { label: "XY", value: "xy" },
  { label: "XZ", value: "xz" },
  { label: "YZ", value: "yz" },
];

interface QueryOptions {
  granularity?: EmbeddingGranularity;
  projection?: EmbeddingProjection;
  showExampleQueries?: boolean;
  showCentroids?: boolean;
}

function formatCoordinate(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatSimilarity(value?: number) {
  return typeof value === "number" ? value.toFixed(3) : null;
}

export function EmbeddingSpaceApp() {
  const mapCopy = uiCopy.semanticMapPage;
  const totalSourceRecords =
    datasetStats.support + datasetStats.enhancements + datasetStats.incidents;
  const [query, setQuery] = useState(exampleQueries[0]);
  const [payload, setPayload] = useState<EmbeddingMapPayload | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<EmbeddingGranularity>("record");
  const [projection, setProjection] = useState<EmbeddingProjection>("pca");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("3d");
  const [axisPair, setAxisPair] = useState<AxisPair>("xy");
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("isometric");
  const [showCentroids, setShowCentroids] = useState(false);
  const [showExampleQueries, setShowExampleQueries] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("selected");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLoadingRef = useRef(false);
  const optionsRef = useRef({
    granularity: "record" as EmbeddingGranularity,
    projection: "pca" as EmbeddingProjection,
    showCentroids: false,
    showExampleQueries: true,
  });

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    optionsRef.current = {
      granularity,
      projection,
      showCentroids,
      showExampleQueries,
    };
  }, [granularity, projection, showCentroids, showExampleQueries]);

  const selectedNode = useMemo(() => {
    if (!payload) {
      return null;
    }

    const preferredId =
      selectedId ??
      payload.links[0]?.targetId ??
      payload.nearest[0]?.id ??
      payload.nodes[0]?.id;

    return payload.nodes.find((node) => node.id === preferredId) ?? null;
  }, [payload, selectedId]);

  const runQuery = useCallback(async (nextQuery: string, nextOptions?: QueryOptions) => {
    const trimmed = nextQuery.trim();

    if (!trimmed || isLoadingRef.current) {
      return;
    }

    const resolvedGranularity =
      nextOptions?.granularity ?? optionsRef.current.granularity;
    const resolvedProjection =
      nextOptions?.projection ?? optionsRef.current.projection;
    const resolvedShowExampleQueries =
      nextOptions?.showExampleQueries ?? optionsRef.current.showExampleQueries;
    const resolvedShowCentroids =
      nextOptions?.showCentroids ?? optionsRef.current.showCentroids;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/embedding-space?query=${encodeURIComponent(trimmed)}&granularity=${resolvedGranularity}&projection=${resolvedProjection}&centroids=${resolvedShowCentroids ? "1" : "0"}&examples=${resolvedShowExampleQueries ? "1" : "0"}`,
      );
      const nextPayload = (await response.json()) as
        | EmbeddingMapPayload
        | { error: string };

      if (!response.ok || !("nodes" in nextPayload)) {
        throw new Error("error" in nextPayload ? nextPayload.error : "Request failed.");
      }

      setPayload(nextPayload);
      setQuery(trimmed);
      setGranularity(nextPayload.granularity);
      setProjection(nextPayload.projection);
      setShowExampleQueries(nextPayload.exampleQueriesEnabled);
      setShowCentroids(nextPayload.centroidsEnabled);
      setSelectedId(
        nextPayload.links[0]?.targetId ??
          nextPayload.nearest[0]?.id ??
          nextPayload.nodes[0]?.id ??
          null,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The semantic map could not be generated.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void runQuery(exampleQueries[0], {
      granularity: "record",
      projection: "pca",
      showCentroids: false,
      showExampleQueries: true,
    });
  }, [runQuery]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runQuery(query);
  }

  function handleProjectionChange(nextProjection: EmbeddingProjection) {
    setProjection(nextProjection);
    void runQuery(query, { projection: nextProjection });
  }

  function handleGranularityChange(nextGranularity: EmbeddingGranularity) {
    setGranularity(nextGranularity);
    void runQuery(query, { granularity: nextGranularity });
  }

  function handleShowCentroids(nextValue: boolean) {
    setShowCentroids(nextValue);
    void runQuery(query, { showCentroids: nextValue });
  }

  function handleShowExampleQueries(nextValue: boolean) {
    setShowExampleQueries(nextValue);
    void runQuery(query, { showExampleQueries: nextValue });
  }

  function handleSelectNode(id: string, nextTab: InspectorTab = "selected") {
    setSelectedId(id);
    setInspectorTab(nextTab);
  }

  const projectionCopy = getProjectionCopy(projection);
  const granularityCopy = getGranularityCopy(granularity);
  const selectionCoordinates = selectedNode
    ? `${formatCoordinate(selectedNode.x)} / ${formatCoordinate(selectedNode.y)} / ${formatCoordinate(selectedNode.z)}`
    : null;
  const queryStatus = isLoading
    ? mapCopy.status.queryLoading
    : payload?.query
      ? mapCopy.status.queryReady
      : mapCopy.status.queryWaiting;
  const viewStatus = payload
    ? `${projection.toUpperCase()} / ${granularity} / ${payload.stats.plottedPoints} pts`
    : `${projection.toUpperCase()} / ${granularity}`;
  const centroidSummary = payload?.centroidBreakdown.length
    ? payload.centroidBreakdown
        .map((entry) => `${entry.family} ${entry.count}`)
        .join(" / ")
    : null;

  return (
    <main className={styles.shell}>
      <header className={styles.topStrip}>
        <div className={styles.titleBlock}>
          <div className={styles.navRow}>
            <Link className={styles.backLink} href="/">
              {mapCopy.navBack}
            </Link>
            <span className={styles.eyebrow}>{uiCopy.labels.semanticMap}</span>
          </div>
          <h1>{mapCopy.title}</h1>
          <p>{mapCopy.intro}</p>
        </div>

        <div className={styles.headerActions}>
          <span className={styles.infoChip}>
            {mapCopy.status.dataset}: {payload?.stats.sourceRecords ?? totalSourceRecords}
          </span>
          <span className={styles.infoChip}>
            {mapCopy.status.view}: {viewStatus}
          </span>
          <span className={styles.infoChip}>
            {mapCopy.status.query}: {queryStatus}
          </span>
          <button
            className={styles.secondaryButton}
            onClick={() => setShowHelp(true)}
            type="button"
          >
            {mapCopy.controls.help}
          </button>
        </div>
      </header>

      <section className={styles.controlStrip}>
        <form className={styles.queryPanel} onSubmit={handleSubmit}>
          <div className={styles.fieldLabel}>{mapCopy.controls.question}</div>
          <div className={styles.queryRow}>
            <textarea
              className={styles.queryInput}
              onChange={(event) => setQuery(event.target.value)}
              rows={3}
              value={query}
            />
            <div className={styles.queryActions}>
              <button className={styles.primaryButton} disabled={isLoading} type="submit">
                {isLoading ? "Projecting..." : mapCopy.controls.projectQuery}
              </button>
              {payload ? (
                <span className={styles.infoChip}>
                  {mapCopy.detail.modelLabel}: {payload.model}
                </span>
              ) : null}
            </div>
          </div>
          {error ? <p className={styles.requestError}>{error}</p> : null}
        </form>

        <div className={styles.filterStrip}>
          <div className={styles.filterGroup}>
            <span className={styles.fieldLabel}>{mapCopy.controls.projection}</span>
            <div className={styles.segmentedRow}>
              {(["pca", "umap"] as const).map((option) => (
                <button
                  key={option}
                  className={`${styles.toggleChip} ${projection === option ? styles.toggleChipActive : ""}`}
                  disabled={isLoading}
                  onClick={() => handleProjectionChange(option)}
                  type="button"
                >
                  {option.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <label className={styles.filterGroup}>
            <span className={styles.fieldLabel}>{mapCopy.controls.granularity}</span>
            <select
              className={styles.selectField}
              disabled={isLoading}
              onChange={(event) =>
                handleGranularityChange(event.target.value as EmbeddingGranularity)
              }
              value={granularity}
            >
              {GRANULARITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.filterActions}>
            <button
              className={styles.secondaryButton}
              onClick={() => setShowSettings((current) => !current)}
              type="button"
            >
              {showSettings ? mapCopy.controls.hideSettings : mapCopy.controls.moreSettings}
            </button>
          </div>
        </div>

        <div className={styles.exampleRail}>
          <span className={styles.fieldLabel}>{mapCopy.controls.suggested}</span>
          <div className={styles.exampleRow}>
            {exampleQueries.map((exampleQuery) => (
              <button
                key={exampleQuery}
                className={styles.exampleButton}
                disabled={isLoading}
                onClick={() => {
                  setQuery(exampleQuery);
                  void runQuery(exampleQuery);
                  setInspectorTab("nearest");
                }}
                type="button"
              >
                {exampleQuery}
              </button>
            ))}
          </div>
        </div>

        {showSettings ? (
          <div className={styles.advancedPanel}>
            <div className={styles.advancedGroup}>
              <span className={styles.fieldLabel}>{mapCopy.controls.display}</span>
              <div className={styles.segmentedRow}>
                {(["3d", "2d"] as const).map((option) => (
                  <button
                    key={option}
                    className={`${styles.toggleChip} ${displayMode === option ? styles.toggleChipActive : ""}`}
                    onClick={() => setDisplayMode(option)}
                    type="button"
                  >
                    {option === "3d"
                      ? mapCopy.controls.display3d
                      : mapCopy.controls.display2d}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.advancedGroup}>
              <span className={styles.fieldLabel}>
                {displayMode === "3d" ? mapCopy.controls.camera : mapCopy.controls.plane}
              </span>
              <div className={styles.segmentedRow}>
                {(displayMode === "3d" ? CAMERA_OPTIONS : AXIS_OPTIONS).map((option) => (
                  <button
                    key={option.value}
                    className={`${styles.toggleChip} ${
                      (displayMode === "3d"
                        ? cameraPreset === option.value
                        : axisPair === option.value)
                        ? styles.toggleChipActive
                        : ""
                    }`}
                    onClick={() => {
                      if (displayMode === "3d") {
                        setCameraPreset(option.value as CameraPreset);
                      } else {
                        setAxisPair(option.value as AxisPair);
                      }
                    }}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.advancedGroup}>
              <span className={styles.fieldLabel}>{mapCopy.controls.overlays}</span>
              <div className={styles.toggleGrid}>
                <label className={styles.checkboxRow}>
                  <input
                    checked={showCentroids}
                    disabled={isLoading}
                    onChange={(event) => handleShowCentroids(event.target.checked)}
                    type="checkbox"
                  />
                  <span>{mapCopy.controls.showCentroids}</span>
                </label>
                <label className={styles.checkboxRow}>
                  <input
                    checked={showExampleQueries}
                    disabled={isLoading}
                    onChange={(event) => handleShowExampleQueries(event.target.checked)}
                    type="checkbox"
                  />
                  <span>{mapCopy.controls.showExampleQueries}</span>
                </label>
                <label className={styles.checkboxRow}>
                  <input
                    checked={showLinks}
                    onChange={(event) => setShowLinks(event.target.checked)}
                    type="checkbox"
                  />
                  <span>{mapCopy.controls.showLinks}</span>
                </label>
                <label className={styles.checkboxRow}>
                  <input
                    checked={autoRotate}
                    onChange={(event) => setAutoRotate(event.target.checked)}
                    type="checkbox"
                  />
                  <span>{mapCopy.controls.autoRotate}</span>
                </label>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className={styles.workspace}>
        <section className={styles.mapPanel}>
          <div className={styles.mapToolbar}>
            <div className={styles.legendRow}>
              <span className={styles.legendItem}>
                <i className={`${styles.legendDot} ${styles.supportDot}`} />
                Support
              </span>
              <span className={styles.legendItem}>
                <i className={`${styles.legendDot} ${styles.enhancementDot}`} />
                Enhancement
              </span>
              <span className={styles.legendItem}>
                <i className={`${styles.legendDot} ${styles.incidentDot}`} />
                Incident
              </span>
              <span className={styles.legendItem}>
                <i className={`${styles.legendDot} ${styles.centroidDot}`} />
                Centroid
              </span>
              <span className={styles.legendItem}>
                <i className={`${styles.legendDot} ${styles.exampleDot}`} />
                Example
              </span>
              <span className={styles.legendItem}>
                <i className={`${styles.legendDot} ${styles.queryDot}`} />
                Query
              </span>
            </div>

            <div className={styles.metaRow}>
              {payload ? (
                <span className={styles.infoChip}>
                  {mapCopy.detail.plottedLabel}: {payload.stats.plottedPoints}
                </span>
              ) : null}
              <span className={styles.infoChip}>
                {projection.toUpperCase()} / {granularity}
              </span>
              {centroidSummary ? <span className={styles.infoChip}>{centroidSummary}</span> : null}
            </div>
          </div>

          <div className={styles.viewerFrame}>
            {payload ? (
              <EmbeddingSpaceViewer
                autoRotate={autoRotate}
                axisPair={axisPair}
                cameraPreset={cameraPreset}
                displayMode={displayMode}
                links={showLinks ? payload.links : []}
                nodes={payload.nodes}
                onSelect={(id) => handleSelectNode(id)}
                selectedId={selectedNode?.id ?? null}
              />
            ) : (
              <div className={styles.viewerFallback}>
                <p>{isLoading ? mapCopy.viewer.loading : mapCopy.viewer.empty}</p>
              </div>
            )}
          </div>

          <div className={styles.viewerHint}>
            <p>
              {displayMode === "3d"
                ? mapCopy.controls.viewerHint
                : `${axisPair.toUpperCase()} plane. ${mapCopy.controls.planeHint}`}
            </p>
          </div>
        </section>

        <aside className={styles.inspector}>
          <div className={styles.inspectorHeader}>
            <div>
              <span className={styles.eyebrow}>{mapCopy.inspector.title}</span>
              <h2>
                {inspectorTab === "selected"
                  ? mapCopy.inspector.selectedTitle
                  : inspectorTab === "nearest"
                    ? mapCopy.inspector.nearestTitle
                    : mapCopy.inspector.examplesTitle}
              </h2>
            </div>
          </div>

          <div className={styles.tabRow}>
            <button
              className={`${styles.tabButton} ${inspectorTab === "selected" ? styles.tabButtonActive : ""}`}
              onClick={() => setInspectorTab("selected")}
              type="button"
            >
              {mapCopy.inspector.selectedTab}
            </button>
            <button
              className={`${styles.tabButton} ${inspectorTab === "nearest" ? styles.tabButtonActive : ""}`}
              onClick={() => setInspectorTab("nearest")}
              type="button"
            >
              {mapCopy.inspector.nearestTab}
            </button>
            <button
              className={`${styles.tabButton} ${inspectorTab === "examples" ? styles.tabButtonActive : ""}`}
              onClick={() => setInspectorTab("examples")}
              type="button"
            >
              {mapCopy.inspector.examplesTab}
            </button>
          </div>

          <div className={styles.inspectorBody}>
            {inspectorTab === "selected" ? (
              selectedNode ? (
                <div className={styles.detailPanel}>
                  <div className={styles.detailHeader}>
                    <div>
                      <p className={styles.detailKind}>{formatMapKind(selectedNode.kind)}</p>
                      <h3>{selectedNode.title}</h3>
                    </div>
                    {formatSimilarity(selectedNode.score) ? (
                      <span className={styles.infoChip}>
                        {mapCopy.detail.similarityLabel}: {formatSimilarity(selectedNode.score)}
                      </span>
                    ) : null}
                  </div>

                  {selectedNode.kind === "example" ? (
                    <button
                      className={styles.secondaryButton}
                      onClick={() => {
                        setQuery(selectedNode.title);
                        void runQuery(selectedNode.title);
                        setInspectorTab("nearest");
                      }}
                      type="button"
                    >
                      {mapCopy.detail.useQuestion}
                    </button>
                  ) : null}

                  <div className={styles.metaGrid}>
                    {selectionCoordinates ? (
                      <div className={styles.metaCard}>
                        <span>{mapCopy.detail.coordinatesLabel}</span>
                        <strong>{selectionCoordinates}</strong>
                      </div>
                    ) : null}
                    {selectedNode.sourceId ? (
                      <div className={styles.metaCard}>
                        <span>{mapCopy.detail.sourceLabel}</span>
                        <strong>
                          {selectedNode.sourceTitle && selectedNode.sourceTitle !== selectedNode.title
                            ? `${selectedNode.sourceId}: ${selectedNode.sourceTitle}`
                            : selectedNode.sourceId}
                        </strong>
                      </div>
                    ) : null}
                    {selectedNode.sourceCustomer ? (
                      <div className={styles.metaCard}>
                        <span>{mapCopy.detail.customerLabel}</span>
                        <strong>{selectedNode.sourceCustomer}</strong>
                      </div>
                    ) : null}
                    {selectedNode.sourceTone ? (
                      <div className={styles.metaCard}>
                        <span>{mapCopy.detail.toneLabel}</span>
                        <strong>{selectedNode.sourceTone}</strong>
                      </div>
                    ) : null}
                    {selectedNode.overlayFamily ? (
                      <div className={styles.metaCard}>
                        <span>{mapCopy.detail.centroidFamilyLabel}</span>
                        <strong>{selectedNode.overlayFamily}</strong>
                      </div>
                    ) : null}
                    {selectedNode.segmentLabel && selectedNode.segmentLabel !== "record" ? (
                      <div className={styles.metaCard}>
                        <span>{mapCopy.detail.segmentLabel}</span>
                        <strong>{selectedNode.segmentLabel}</strong>
                      </div>
                    ) : null}
                    {typeof selectedNode.pointCount === "number" ? (
                      <div className={styles.metaCard}>
                        <span>{mapCopy.detail.pointCountLabel}</span>
                        <strong>{selectedNode.pointCount}</strong>
                      </div>
                    ) : null}
                  </div>

                  <p className={styles.detailSummary}>{selectedNode.summary}</p>
                  <p className={styles.detailSnippet}>{selectedNode.snippet}</p>

                  {selectedNode.tags.length ? (
                    <div className={styles.tagRow}>
                      {selectedNode.tags.map((tag) => (
                        <span key={tag} className={styles.tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className={styles.emptyState}>{mapCopy.empty.selectedItem}</p>
              )
            ) : null}

            {inspectorTab === "nearest" ? (
              payload?.nearest.length ? (
                <div className={styles.listColumn}>
                  {payload.nearest.map((item) => (
                    <button
                      key={item.id}
                      className={`${styles.listButton} ${selectedNode?.id === item.id ? styles.listButtonActive : ""}`}
                      onClick={() => handleSelectNode(item.id)}
                      type="button"
                    >
                      <div>
                        <strong>{item.sourceId ?? item.id}</strong>
                        <p>{item.title}</p>
                        {item.segmentLabel && item.segmentLabel !== "record" ? (
                          <em>{item.segmentLabel}</em>
                        ) : null}
                      </div>
                      {typeof item.score === "number" ? (
                        <span className={styles.listMeta}>{item.score.toFixed(3)}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.emptyState}>{mapCopy.empty.nearestEvidence}</p>
              )
            ) : null}

            {inspectorTab === "examples" ? (
              <div className={styles.examplesPanel}>
                <div className={styles.examplesSection}>
                  <div className={styles.subsectionHeader}>
                    <h3>Nearby example questions</h3>
                    <button
                      className={styles.secondaryButton}
                      onClick={() => handleShowExampleQueries(!showExampleQueries)}
                      type="button"
                    >
                      {showExampleQueries
                        ? "Hide example overlays"
                        : mapCopy.controls.showExampleQueries}
                    </button>
                  </div>

                  {showExampleQueries && payload?.relatedQueries.length ? (
                    <div className={styles.listColumn}>
                      {payload.relatedQueries.map((item) => (
                        <button
                          key={item.id}
                          className={styles.listButton}
                          onClick={() => {
                            setQuery(item.query);
                            void runQuery(item.query);
                            setInspectorTab("nearest");
                          }}
                          type="button"
                        >
                          <div>
                            <strong>{item.id.replace("example-query:", "Example ")}</strong>
                            <p>{item.query}</p>
                          </div>
                          <span className={styles.listMeta}>{item.score.toFixed(3)}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.emptyState}>{mapCopy.empty.nearbyQuestions}</p>
                  )}
                </div>

                <div className={styles.examplesSection}>
                  <div className={styles.subsectionHeader}>
                    <h3>Saved prompts</h3>
                  </div>
                  <div className={styles.listColumn}>
                    {exampleQueries.map((exampleQuery) => (
                      <button
                        key={exampleQuery}
                        className={styles.listButton}
                        disabled={isLoading}
                        onClick={() => {
                          setQuery(exampleQuery);
                          void runQuery(exampleQuery);
                          setInspectorTab("nearest");
                        }}
                        type="button"
                      >
                        <div>
                          <strong>Saved prompt</strong>
                          <p>{exampleQuery}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </section>

      {showHelp ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setShowHelp(false)}
          role="presentation"
        >
          <div
            className={styles.helpModal}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-labelledby="semantic-map-help-title"
            aria-modal="true"
          >
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>{mapCopy.controls.help}</span>
                <h2 id="semantic-map-help-title">{mapCopy.help.title}</h2>
              </div>
              <button
                className={styles.secondaryButton}
                onClick={() => setShowHelp(false)}
                type="button"
              >
                {mapCopy.help.close}
              </button>
            </div>

            <p className={styles.modalLead}>{mapCopy.help.body}</p>

            <div className={styles.helpGrid}>
              <article className={styles.helpCard}>
                <span className={styles.fieldLabel}>{mapCopy.help.distanceTitle}</span>
                <p>{mapCopy.help.distanceBody}</p>
              </article>
              <article className={styles.helpCard}>
                <span className={styles.fieldLabel}>{mapCopy.help.projectionTitle}</span>
                <p>{mapCopy.help.projectionBody}</p>
              </article>
              <article className={styles.helpCard}>
                <span className={styles.fieldLabel}>{mapCopy.help.granularityTitle}</span>
                <p>{granularityCopy}</p>
              </article>
              <article className={styles.helpCard}>
                <span className={styles.fieldLabel}>{mapCopy.help.retrievalTitle}</span>
                <p>{mapCopy.help.retrievalBody}</p>
              </article>
            </div>

            <div className={styles.modalFooter}>
              <span className={styles.infoChip}>{projectionCopy.title}</span>
              <span className={styles.infoChip}>{granularity}</span>
              {payload ? (
                <span className={styles.infoChip}>
                  {payload.stats.plottedPoints} plotted points
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
