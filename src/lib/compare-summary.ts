import type { BotResult, ComparisonSummary } from "@/lib/demo-types";

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
    if (dumb.errorLabel === "Config issue") {
      return {
        headline: "The tool bot needs an OpenAI API key.",
        body: dumb.error,
      };
    }

    if (dumb.errorLabel === "TLS issue") {
      return {
        headline: "The tool bot is hitting a TLS trust issue.",
        body: dumb.error,
      };
    }

    return {
      headline: "The tool bot hit a connection problem.",
      body: dumb.error,
    };
  }

  if (smart.error) {
    if (smart.errorLabel === "Config issue") {
      return {
        headline: "The semantic path needs an OpenAI API key.",
        body: smart.error,
      };
    }

    if (smart.errorLabel === "TLS issue") {
      return {
        headline: "The semantic path is hitting a TLS trust issue.",
        body: smart.error,
      };
    }

    return {
      headline: "The semantic path hit a connection problem.",
      body: smart.error,
    };
  }

  const dumbKeywords = firstKeywords(dumb);
  const smartEnhancements = firstTitles(smart, "enhancement");
  const enhancementText = smartEnhancements.length
    ? smartEnhancements.join(" and ")
    : "the top retrieved enhancement candidates";

  if (!dumb.retrieved.length) {
    return {
      headline: "The tool bot stalled on literal retrieval.",
      body: `It could not find enough exact keyword, tag, or enhancement-name matches to answer strongly. The embedding bot still linked the question to evidence and surfaced improvements such as ${enhancementText}.`,
    };
  }

  if (!firstTitles(dumb, "enhancement").length && smartEnhancements.length) {
    return {
      headline: "The tool bot found symptoms, but not implied fixes.",
      body: `It stayed close to surface terms${dumbKeywords.length ? ` like ${dumbKeywords.join(", ")}` : ""} and could not bridge those matches to enhancement ideas unless a name was explicitly mentioned. The embedding bot connected the same evidence to ${enhancementText}.`,
    };
  }

  return {
    headline: "The embedding bot connected a broader product story.",
    body: `The tool bot stayed procedural and literal${dumbKeywords.length ? ` around ${dumbKeywords.join(", ")}` : ""}. The embedding bot grouped differently worded tickets into the same design problems and returned a more actionable answer.`,
  };
}
