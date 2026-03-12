# Project Instructions

## Purpose

This repo is a small Next.js demo that compares literal MCP-style retrieval against embedding-based semantic retrieval.

## Commands

- Install dependencies: `npm install`
- Run the local development app: `npm run dev`
- Build for production: `npm run build`
- Start the production server after build: `npm run start`
- Run lint checks: `npm run lint`
- In the Codex desktop terminal, use `.\scripts\run-codex.ps1 dev` because that terminal can start in a `\\?\C:\...` provider path that breaks `npm run ...` on Windows.

These scripts set `NODE_USE_SYSTEM_CA=1` so OpenAI API calls work on Windows environments that rely on the system certificate store.

## Environment

- Both bots require `OPENAI_API_KEY` in `.env.local`.
- Optional model overrides:
  - `OPENAI_EMBEDDING_MODEL`
  - `OPENAI_RESPONSE_MODEL`
- Without `OPENAI_API_KEY`, the UI still loads, but both bots show configuration errors.

## App Notes

- Default local URL: `http://localhost:3000`
- Use the example queries in the UI to demonstrate the retrieval contrast quickly.
