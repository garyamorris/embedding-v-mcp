# Embeddings vs MCP Demo

This is a small, self-contained Next.js demo that compares two retrieval styles on the same local dataset:

- `Dumb Bot (MCP / Tools)` uses an OpenAI model to choose and sequence a fixed set of explicit retrieval tools such as keyword search, tag filters, and exact enhancement-name lookups.
- `Smart Bot (Embeddings)` uses OpenAI embeddings to retrieve semantically related support tickets, enhancement candidates, and incident summaries before drafting an answer with an OpenAI model.

The goal is to make the contrast obvious for complex product questions. The local support data deliberately describes similar problems in different language, so literal retrieval underperforms while semantic retrieval can still connect the dots.

## What the demo proves

When you click an advanced example query, the app should make four things clear:

1. The MCP-style bot is understandable but limited because it relies on explicit tools and exact wording.
2. The embedding bot can retrieve better evidence even when users describe the same pain in different language.
3. Better retrieval leads to better answers, especially for implied enhancements and shared root causes.
4. The process trace explains why each bot performed the way it did.

## Stack

- Next.js 16
- React 19
- TypeScript
- OpenAI JavaScript SDK (`openai`)
- Local mock data in `src/data/demo-data.ts`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the example environment file and add your OpenAI key:

```bash
copy .env.example .env.local
```

3. Start the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

If you are running inside the Codex desktop terminal on Windows, use this instead:

```powershell
.\scripts\run-codex.ps1 dev
```

That terminal can open the workspace under a PowerShell provider path like `\\?\C:\...`, which breaks `npm run ...` because `cmd.exe`, Node, and Next do not consistently normalize it.

## Environment variables

- `OPENAI_API_KEY` is required for both bots.
- `OPENAI_EMBEDDING_MODEL` is optional. Default: `text-embedding-3-small`
- `OPENAI_RESPONSE_MODEL` is optional. Default: `gpt-4.1-mini`

If `OPENAI_API_KEY` is missing, the UI still loads, but both comparison paths will show configuration errors because both rely on OpenAI models.

On Windows or corporate networks where Node does not trust the local issuer chain by default, the package scripts already set `NODE_USE_SYSTEM_CA=1` so OpenAI API calls can use the system certificate store.

## How it works

### Dumb Bot

The Dumb Bot uses a model-driven MCP-style workflow over explicit tools only:

- `searchSupportByKeyword(keyword)`
- `filterSupportByTag(tag)`
- `getEnhancementByName(name)`
- `searchIncidentsByKeyword(keyword)`

The model chooses which tools to call from the same fixed tool list on every query, but the tools themselves are rigid and literal. They do exact keyword matching, exact tag filtering, and exact enhancement-name lookup only, so the bot still struggles with implied themes and differently worded evidence.

### Smart Bot

The Smart Bot:

1. Embeds the user query with OpenAI embeddings.
2. Embeds the local dataset and caches the corpus vectors in memory.
3. Runs cosine similarity search over support tickets, enhancement candidates, and incident summaries.
4. Sends the retrieved evidence to an OpenAI model to generate the final answer.

The first Smart Bot request takes longer because it builds the local embedding index. After that, the corpus embeddings are reused for the rest of the session.

## Demo data

The built-in dataset covers:

- support emails / tickets
- enhancement candidates
- incident summaries

Themes intentionally overlap through different language:

- exports that feel frozen because progress is invisible
- uploads that fail late due to missing preflight validation
- confusing permissions and blank states
- slow screen and tab switching
- risky bulk actions with weak confirmations
- indirect reliability concerns caused by poor feedback

## Useful demo queries

The app includes clickable examples such as:

- `Based on our support emails, what product and system enhancements should we prioritise to reduce support volume and user frustration?`
- `What recurring user pain points appear to come from the same underlying design issue?`
- `Are users describing reliability concerns indirectly, even when they don't use words like bug, incident, or failure?`
- `Which support issues sound different on the surface but are probably symptoms of the same system weakness?`

## Verification

Run these after setup:

```bash
npm run lint
npm run build
```

In the Codex desktop terminal on Windows, the equivalent commands are:

```powershell
.\scripts\run-codex.ps1 lint
.\scripts\run-codex.ps1 build
```
