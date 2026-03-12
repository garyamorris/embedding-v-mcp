import type { BotResult, ComparisonSummary } from "@/lib/demo-types";
import { uiCopy } from "@/lib/ui-copy";

function firstTitles(bot: BotResult, kind: "support" | "enhancement" | "incident") {
  return bot.retrieved
    .filter((item) => item.kind === kind)
    .slice(0, 2)
    .map((item) => item.title);
}

function firstKeywords(bot: BotResult) {
  return Array.from(
    new Set(
      bot.retrieved.flatMap((item) => item.matchedKeywords ?? []).filter(Boolean),
    ),
  ).slice(0, 3);
}

export function buildComparisonSummary(
  dumb: BotResult,
  smart: BotResult,
): ComparisonSummary {
  if (dumb.error) {
    if (dumb.errorLabel === uiCopy.labels.setupIssue) {
      return {
        headline: "Tool Bot could not start.",
        body: dumb.error ?? "The Tool Bot is not available.",
      };
    }

    if (dumb.errorLabel === uiCopy.labels.tlsIssue) {
      return {
        headline: "Tool Bot could not connect.",
        body: dumb.error ?? "The Tool Bot hit a TLS issue.",
      };
    }

    return {
      headline: "Tool Bot could not complete the request.",
      body: dumb.error ?? "The Tool Bot hit a connection issue.",
    };
  }

  if (smart.error) {
    if (smart.errorLabel === uiCopy.labels.setupIssue) {
      return {
        headline: "Semantic Bot could not start.",
        body: smart.error ?? "The Semantic Bot is not available.",
      };
    }

    if (smart.errorLabel === uiCopy.labels.tlsIssue) {
      return {
        headline: "Semantic Bot could not connect.",
        body: smart.error ?? "The Semantic Bot hit a TLS issue.",
      };
    }

    return {
      headline: "Semantic Bot could not complete the request.",
      body: smart.error ?? "The Semantic Bot hit a connection issue.",
    };
  }

  const dumbKeywords = firstKeywords(dumb);
  const smartEnhancements = firstTitles(smart, "enhancement");
  const enhancementText = smartEnhancements.length
    ? smartEnhancements.join(" and ")
    : "the top retrieved enhancement candidates";

  if (!dumb.retrieved.length) {
    return {
      headline: "Semantic retrieval found stronger support for this question.",
      body: `The Tool Bot did not find enough exact matches to answer confidently. The Semantic Bot still connected the question to related evidence and surfaced improvements such as ${enhancementText}.`,
    };
  }

  if (!firstTitles(dumb, "enhancement").length && smartEnhancements.length) {
    return {
      headline: "The two paths found different levels of evidence.",
      body: `The Tool Bot stayed close to exact terms${dumbKeywords.length ? ` such as ${dumbKeywords.join(", ")}` : ""} and did not connect those matches to related improvements. The Semantic Bot linked the same question to ${enhancementText}.`,
    };
  }

  return {
    headline: "Both paths answered, but they used different evidence.",
    body: `The Tool Bot stayed close to exact matches${dumbKeywords.length ? ` around ${dumbKeywords.join(", ")}` : ""}. The Semantic Bot grouped related records that used different language and returned a broader answer.`,
  };
}
