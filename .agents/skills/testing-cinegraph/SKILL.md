---
name: testing-cinegraph
description: How to run and browser-test the CineGraph Vite/React SPA locally (search, person/movie pages, shortest path, recommendations, SPA routing).
---

# Testing CineGraph locally

## Run it
- Repo root is the Vite app (it used to live in `real/`). `npm install`, then `npm run dev` → http://localhost:5173.
- Production check: `npm run build && npx vite preview --port 4173`. Deep links (`/person/:id`, `/movie/:id`) should return HTTP 200 under preview; on Vercel the same is handled by the `rewrites` rule in `vercel.json`.
- Node 20.18.x works even though Vite warns it wants >= 20.19; ignore that warning unless the build actually fails.
- No auth, no backend, no secrets. All data is in-memory: `src/data/seed.json` read by `src/lib/graph.ts` via `src/lib/api.ts` (which adds artificial 300–400ms delays, so wait ~1–2s after each action before asserting).

## Getting expected values without guessing
Query the graph engine directly to compute ground truth before asserting in the UI:
`npx tsx -e "import {search,shortestPath,getRecommendations} from './src/lib/graph'; console.log(...)"`.
This is the fastest way to derive expected search results, degree counts and recommendation rankings.

## UI paths worth knowing
- Search page `/`: debounced 250ms input + industry chips (All/Hollywood/Bollywood/Tollywood/Kollywood/Mollywood). People and movies are capped at 10 each.
- Person page `/person/:id`: Filmography → Co-stars → "Find Connection To..." (type a name, click the suggestion card, then click "Find Path") → "Recommended Connections".
- The path form's layout shifts when the target/result is cleared ("Change" button) — re-screenshot and re-locate the input before typing, otherwise clicks land on the wrong element.
- Unknown ids render an error Card with `... with id "x" not found.` plus a Retry button rather than crashing.

## Useful data fixtures (seed.json)
- Leonardo DiCaprio = `p5`, Cillian Murphy = `p10`, Tom Hardy = `p7`, Oppenheimer = `m6`, Rajinikanth = `p52` (Kollywood, disconnected from Hollywood → good "no connection" case).
- "khan" matches only 3 Bollywood people, so it is a clean probe for the person-side industry filter.

## Devin Secrets Needed
None.
