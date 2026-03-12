"use client";

import { FormEvent, useMemo, useState } from "react";

import { datasetStats, exampleQueries } from "@/data/demo-data";
import type {
  BotResult,
  ComparePayload,
  EvidenceCard,
  TraceStep,
} from "@/lib/demo-types";

import styles from "./demo-app.module.css";

type Turn = ComparePayload & {
  id: string;
};

function formatKind(kind: EvidenceCard["kind"]) {
  if (kind === "support") {
    return "Support";
  }

  if (kind === "enhancement") {
    return "Enhancement";
  }

  return "Incident";
}

function EvidenceCluster({ items }: { items: EvidenceCard[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className={styles.evidenceGrid}>
      {items.map((item) => (
        <article key={`${item.kind}-${item.id}`} className={styles.evidenceCard}>
          <div className={styles.evidenceMeta}>
            <span className={styles.kindPill}>{formatKind(item.kind)}</span>
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
          <span className={styles.tagLine}>{item.tags.join(" / ")}</span>
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
                  {step.tone}
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
  eyebrow,
  subtitle,
  turns,
  isLoading,
  mode,
}: {
  title: string;
  eyebrow: string;
  subtitle: string;
  turns: Turn[];
  isLoading: boolean;
  mode: BotResult["mode"];
}) {
  const panelClassName =
    mode === "dumb"
      ? `${styles.botPanel} ${styles.dumbPanel}`
      : `${styles.botPanel} ${styles.smartPanel}`;

  return (
    <section className={panelClassName}>
      <header className={styles.panelHeader}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <div className={styles.panelHeading}>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </header>

      <div className={styles.stream}>
        {!turns.length ? (
          <div className={styles.emptyState}>
            <h3>{mode === "dumb" ? "Rigid by design" : "Meaning-first retrieval"}</h3>
            <p>
              {mode === "dumb"
                ? "Uses an OpenAI model to drive a fixed MCP-style toolset. The orchestration is realistic, but the retrieval layer is still literal and brittle."
                : "Embeds the query, ranks nearby support evidence semantically, and then drafts an answer from the best matches."}
            </p>
          </div>
        ) : null}

        {isLoading ? (
          <div className={styles.loadingCard}>
            <div className={styles.loadingPulse} />
            <p>
              {mode === "dumb"
                ? "Letting the tool bot choose and call rigid tools..."
                : "Embedding the query and ranking the local corpus..."}
            </p>
          </div>
        ) : null}

        {turns.map((turn) => {
          const result = mode === "dumb" ? turn.dumb : turn.smart;

          return (
            <article key={`${turn.id}-${mode}`} className={styles.turnCard}>
              <div className={styles.userBubble}>
                <span className={styles.bubbleLabel}>User query</span>
                <p>{turn.query}</p>
              </div>

              <div className={styles.answerBubble}>
                <div className={styles.answerMeta}>
                  <span className={styles.resultPill}>{result.verdict}</span>
                  {result.error ? (
                    <span className={styles.errorPill}>
                      {result.errorLabel ?? "Error"}
                    </span>
                  ) : null}
                </div>

                <pre className={styles.answerText}>{result.answer}</pre>
                {result.limitation ? (
                  <p className={styles.limitation}>{result.limitation}</p>
                ) : null}

                <div className={styles.sectionLabel}>Retrieved evidence</div>
                <EvidenceCluster items={result.retrieved.slice(0, 6)} />

                <details className={styles.traceDisclosure}>
                  <summary>Process trace</summary>
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
  const compareLine = useMemo(() => {
    if (!latestTurn) {
      return "Ask an advanced question to watch the literal tool chain flatten nuance while the semantic path groups related signals.";
    }

    return `${latestTurn.dumb.retrieved.length} literal hit(s) vs ${latestTurn.smart.retrieved.length} semantic evidence item(s).`;
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
          : "Something went wrong while comparing the bots.",
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
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}>Embeddings vs MCP-style retrieval</span>
          <h1>One question. Two bots. Very different evidence.</h1>
          <p className={styles.heroText}>
            This demo uses a local support dataset full of similar complaints phrased
            differently. The left bot uses a normal MCP-style tool-calling workflow over rigid
            retrieval tools. The right bot embeds the same question, finds
            semantically related tickets and improvements, and then answers from the
            retrieved evidence.
          </p>
        </div>

        <div className={styles.heroAside}>
          <div className={styles.statCard}>
            <span>Dataset</span>
            <strong>{datasetStats.support} support tickets</strong>
            <p>
              {datasetStats.enhancements} enhancement ideas and {datasetStats.incidents}{" "}
              incidents.
            </p>
          </div>
          <div className={styles.statCard}>
            <span>Smart bot</span>
            <strong>First run warms the semantic index</strong>
            <p>The embedding corpus is cached in-memory after it is built once.</p>
          </div>
        </div>
      </section>

      <section className={styles.controlDeck}>
        <div className={styles.examples}>
          <div className={styles.sectionHead}>
            <h2>Curated demo questions</h2>
            <p>
              These are designed so semantic retrieval clearly outperforms literal
              tool calls.
            </p>
          </div>
          <div className={styles.exampleGrid}>
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

        <form className={styles.composer} onSubmit={handleSubmit}>
          <label className={styles.sectionHead} htmlFor="query">
            <h2>Ask your own question</h2>
            <p>The same prompt is sent to both bots.</p>
          </label>
          <textarea
            id="query"
            className={styles.queryInput}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask about recurring pain points, implied enhancements, or hidden reliability concerns."
            rows={4}
            value={query}
          />
          <div className={styles.composerActions}>
            <button className={styles.primaryButton} disabled={isLoading} type="submit">
              {isLoading ? "Comparing..." : "Compare answers"}
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
              Clear transcript
            </button>
          </div>
          {error ? <p className={styles.requestError}>{error}</p> : null}
        </form>
      </section>

      <section className={styles.compareBanner}>
        <div>
          <span className={styles.sectionLabel}>Compare answers</span>
          <h2>{latestTurn?.comparison.headline ?? "Run a query to generate the contrast."}</h2>
          <p>{latestTurn?.comparison.body ?? compareLine}</p>
        </div>
        <div className={styles.compareMetric}>{compareLine}</div>
      </section>

      <section className={styles.panelGrid}>
        <BotPanel
          eyebrow="Dumb Bot"
          isLoading={isLoading}
          mode="dumb"
          subtitle="Normal MCP-style tool bot. An LLM chooses rigid keyword, tag, and exact-name tools."
          title="Tool-driven, procedural, and still surface-bound"
          turns={turns}
        />
        <BotPanel
          eyebrow="Smart Bot"
          isLoading={isLoading}
          mode="smart"
          subtitle="Embeddings + OpenAI answer synthesis over the local demo corpus."
          title="Semantic, connective, and evidence-led"
          turns={turns}
        />
      </section>
    </main>
  );
}
