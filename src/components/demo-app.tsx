"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

import { datasetStats, exampleQueries } from "@/data/demo-data";
import type {
  BotResult,
  ComparePayload,
  EvidenceCard,
  TraceStep,
} from "@/lib/demo-types";
import {
  buildCompareMetric,
  formatEvidenceKind,
  formatTraceTone,
  uiCopy,
} from "@/lib/ui-copy";

import styles from "./demo-app.module.css";

type Turn = ComparePayload & {
  id: string;
};

function EvidenceCluster({ items }: { items: EvidenceCard[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className={styles.evidenceGrid}>
      {items.map((item) => (
        <article key={`${item.kind}-${item.id}`} className={styles.evidenceCard}>
          <div className={styles.evidenceMeta}>
            <span className={styles.kindPill}>{formatEvidenceKind(item.kind)}</span>
            {typeof item.score === "number" ? (
              <span className={styles.metricPill}>sim {item.score.toFixed(3)}</span>
            ) : null}
            {item.matchedKeywords?.length ? (
              <span className={styles.metricPill}>
                hits {item.matchedKeywords.join(", ")}
              </span>
            ) : null}
          </div>
          <h4>{item.title}</h4>
          <p>{item.summary}</p>
          {item.tags.length ? (
            <span className={styles.tagLine}>{item.tags.join(" / ")}</span>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function TraceList({ steps }: { steps: TraceStep[] }) {
  return (
    <ol className={styles.traceList}>
      {steps.map((step, index) => (
        <li key={`${step.title}-${index}`} className={styles.traceItem}>
          <div className={styles.traceIndex}>{index + 1}</div>
          <div className={styles.traceBody}>
            <div className={styles.traceHeader}>
              <h4>{step.title}</h4>
              {step.tone ? (
                <span
                  className={`${styles.traceTone} ${
                    step.tone === "warning"
                      ? styles.traceToneWarning
                      : step.tone === "success"
                        ? styles.traceToneSuccess
                        : styles.traceToneNeutral
                  }`}
                >
                  {formatTraceTone(step.tone)}
                </span>
              ) : null}
            </div>
            <p>{step.summary}</p>
            {step.detail ? <pre className={styles.traceDetail}>{step.detail}</pre> : null}
            {step.items?.length ? <EvidenceCluster items={step.items.slice(0, 4)} /> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function BotPanel({
  title,
  label,
  subtitle,
  emptyTitle,
  emptyBody,
  loadingText,
  turns,
  isLoading,
  mode,
}: {
  title: string;
  label: string;
  subtitle: string;
  emptyTitle: string;
  emptyBody: string;
  loadingText: string;
  turns: Turn[];
  isLoading: boolean;
  mode: BotResult["mode"];
}) {
  const panelClassName =
    mode === "dumb"
      ? `${styles.botPanel} ${styles.toolPanel}`
      : `${styles.botPanel} ${styles.semanticPanel}`;

  return (
    <section className={panelClassName}>
      <header className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>{label}</span>
          <h2>{title}</h2>
        </div>
        <p>{subtitle}</p>
      </header>

      <div className={styles.stream}>
        {!turns.length && !isLoading ? (
          <div className={styles.emptyState}>
            <h3>{emptyTitle}</h3>
            <p>{emptyBody}</p>
          </div>
        ) : null}

        {isLoading ? (
          <div className={styles.loadingCard}>
            <div className={styles.loadingPulse} />
            <p>{loadingText}</p>
          </div>
        ) : null}

        {turns.map((turn) => {
          const result = mode === "dumb" ? turn.dumb : turn.smart;

          return (
            <article key={`${turn.id}-${mode}`} className={styles.turnCard}>
              <div className={styles.userBubble}>
                <span className={styles.bubbleLabel}>{uiCopy.labels.question}</span>
                <p>{turn.query}</p>
              </div>

              <div className={styles.answerBubble}>
                <div className={styles.answerMeta}>
                  <span className={result.error ? styles.errorPill : styles.resultPill}>
                    {result.error ? result.errorLabel ?? result.verdict : result.verdict}
                  </span>
                </div>

                <pre className={styles.answerText}>{result.answer}</pre>
                {result.limitation ? (
                  <p className={styles.limitation}>{result.limitation}</p>
                ) : null}

                <div className={styles.sectionLabel}>{uiCopy.labels.retrievedEvidence}</div>
                <EvidenceCluster items={result.retrieved.slice(0, 5)} />

                <details className={styles.traceDisclosure}>
                  <summary>{uiCopy.labels.processTrace}</summary>
                  <TraceList steps={result.trace} />
                </details>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function DemoApp() {
  const [query, setQuery] = useState(exampleQueries[0]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestTurn = turns[0];
  const datasetSummary = `${datasetStats.support} support / ${datasetStats.enhancements} enhancements / ${datasetStats.incidents} incidents`;
  const compareLine = useMemo(() => {
    if (!latestTurn) {
      return uiCopy.comparePage.sections.compareBody;
    }

    return buildCompareMetric(
      latestTurn.dumb.retrieved.length,
      latestTurn.smart.retrieved.length,
    );
  }, [latestTurn]);

  async function runQuery(nextQuery: string) {
    const trimmed = nextQuery.trim();

    if (!trimmed || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setTurns([]);

    try {
      const response = await fetch("/api/compare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: trimmed }),
      });

      const payload = (await response.json()) as ComparePayload | { error: string };

      if (!response.ok || !("query" in payload)) {
        throw new Error("error" in payload ? payload.error : "Request failed.");
      }

      setTurns([
        {
          ...payload,
          id: `${Date.now()}`,
        },
      ]);
      setQuery(trimmed);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong while comparing the retrieval paths.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runQuery(query);
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topStrip}>
        <div className={styles.titleBlock}>
          <span className={styles.kicker}>{uiCopy.comparePage.hero.kicker}</span>
          <h1>{uiCopy.comparePage.hero.title}</h1>
          <p>{uiCopy.comparePage.hero.body}</p>
        </div>

        <div className={styles.topActions}>
          <Link className={styles.mapLink} href="/embedding-space">
            {uiCopy.comparePage.hero.cta}
          </Link>
          <span className={styles.infoChip}>{uiCopy.comparePage.hero.datasetChip}</span>
          <span className={styles.infoChip}>{datasetSummary}</span>
          <span className={styles.infoChip}>{uiCopy.comparePage.hero.cacheChip}</span>
        </div>
      </header>

      <section className={styles.controlStrip}>
        <form className={styles.queryForm} onSubmit={handleSubmit}>
          <div className={styles.formHeader}>
            <div>
              <span className={styles.sectionLabel}>{uiCopy.comparePage.sections.askTitle}</span>
              <h2>{uiCopy.comparePage.sections.askBody}</h2>
            </div>
          </div>

          <div className={styles.queryRow}>
            <textarea
              className={styles.queryInput}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={uiCopy.comparePage.sections.questionPlaceholder}
              rows={3}
              value={query}
            />

            <div className={styles.queryActions}>
              <button className={styles.primaryButton} disabled={isLoading} type="submit">
                {isLoading ? "Comparing..." : uiCopy.comparePage.sections.submit}
              </button>
              <button
                className={styles.secondaryButton}
                disabled={isLoading || !turns.length}
                onClick={() => {
                  setTurns([]);
                  setError(null);
                }}
                type="button"
              >
                {uiCopy.comparePage.sections.clear}
              </button>
            </div>
          </div>

          {error ? <p className={styles.requestError}>{error}</p> : null}
        </form>

        <div className={styles.exampleRail}>
          <span className={styles.sectionLabel}>
            {uiCopy.comparePage.sections.suggestedQuestionsTitle}
          </span>
          <div className={styles.exampleRow}>
            {exampleQueries.map((exampleQuery) => (
              <button
                key={exampleQuery}
                className={styles.exampleButton}
                disabled={isLoading}
                onClick={() => {
                  setQuery(exampleQuery);
                  void runQuery(exampleQuery);
                }}
                type="button"
              >
                {exampleQuery}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.compareBanner}>
        <div className={styles.compareCopy}>
          <span className={styles.sectionLabel}>{uiCopy.comparePage.sections.compareLabel}</span>
          <h2>{latestTurn?.comparison.headline ?? uiCopy.comparePage.sections.compareTitle}</h2>
          <p>{latestTurn?.comparison.body ?? uiCopy.comparePage.sections.compareBody}</p>
        </div>
        <div className={styles.compareMetric}>{compareLine}</div>
      </section>

      <section className={styles.panelGrid}>
        <BotPanel
          emptyBody={uiCopy.comparePage.panels.tool.emptyBody}
          emptyTitle={uiCopy.comparePage.panels.tool.emptyTitle}
          isLoading={isLoading}
          label={uiCopy.comparePage.panels.tool.label}
          loadingText={uiCopy.comparePage.panels.tool.loading}
          mode="dumb"
          subtitle={uiCopy.comparePage.panels.tool.subtitle}
          title={uiCopy.comparePage.panels.tool.title}
          turns={turns}
        />
        <BotPanel
          emptyBody={uiCopy.comparePage.panels.semantic.emptyBody}
          emptyTitle={uiCopy.comparePage.panels.semantic.emptyTitle}
          isLoading={isLoading}
          label={uiCopy.comparePage.panels.semantic.label}
          loadingText={uiCopy.comparePage.panels.semantic.loading}
          mode="smart"
          subtitle={uiCopy.comparePage.panels.semantic.subtitle}
          title={uiCopy.comparePage.panels.semantic.title}
          turns={turns}
        />
      </section>
    </main>
  );
}
