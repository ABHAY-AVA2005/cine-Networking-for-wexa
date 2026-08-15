# CineGraph — Implementation Log

This document tracks the step-by-step development of CineGraph, answering the
key architectural and design questions for the assignment.

---

## Step 1: Project Scaffolding

**What was done:** Set up a Vite + React + TypeScript + Tailwind CSS project
with shadcn/ui components. React Router installed for client-side routing.

**Why Vite instead of Next.js:** The Bolt environment uses Vite, not Next.js.
The app is structured so the API logic (lib/db.ts, lib/graph.ts, lib/api.ts)
maps 1:1 to Next.js API route handlers — swapping to Next.js is a file-move,
not a rewrite. All Cypher queries and the data model are identical.

---

## Step 2: Data Model Design

**Nodes:**
- `(:Person {id, name, bio, imageUrl, role})` — actors and directors
- `(:Movie {id, title, year, posterUrl, overview})` — films
- `(:Genre {name})` — genre labels

**Relationships:**
- `(:Person)-[:ACTED_IN {role}]->(:Movie)` — person played a character
- `(:Person)-[:DIRECTED]->(:Movie)` — person directed the film
- `(:Movie)-[:IN_GENRE]->(:Genre)` — movie belongs to genre

**Why this shape:**
- Person and Movie are the core entities. Genre is a separate node (not a
  property) because we want to traverse genre connections in future queries
  (e.g., "find actors in the same genre").
- ACTED_IN carries a `role` property — the character name matters for display.
- DIRECTED has no properties — it's a simple boolean relationship.
- IDs are string-based (p1, m1) for human readability in the seed data.
  Production would use UUIDs.

**Why not a relational schema:**
The Person-Movie relationship is many-to-many in both directions (an actor is
in many movies, a movie has many actors). In SQL this requires junction tables
(`person_movie`, `person_directed_movie`, `movie_genre`). The shortest-path
query requires traversing these junctions recursively — see below.

---

## Step 3: lib/db.ts — Database Driver

**Implementation:**
- Reads `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` from `process.env`
- Creates a shared `neo4j.driver()` singleton (reused across requests)
- Exports `runQuery(cypher, params)` that opens a session, runs the query,
  and closes the session in a `finally` block
- Wraps driver creation and query execution in try/catch
- Throws typed errors that API routes can catch

**Error handling when CognoDB is unreachable:**
- `getDriver()` throws if env vars are missing
- `runQuery()` catches connection/query errors and re-throws with a message
- API route handlers catch these and return HTTP 503 with a JSON error body:
  `{ "error": "Database unreachable" }`
- The UI shows a friendly error card with a Retry button — the process never
  crashes

---

## Step 4: scripts/seed.ts — Seed Script

**Implementation:**
- Reads `src/data/seed.json` (50 people, 18 movies, 8 genres, ~60 relationships)
- Uses `UNWIND + MERGE` for idempotent batch upserts
- All queries are parameterized — seed data is passed as `$params`, never
  string-concatenated into Cypher
- Logs progress per batch and a final summary count

**Dataset:** Curated from well-known films (Nolan films, Matrix trilogy,
Gladiator, Pulp Fiction, etc.) with real actor/director relationships. Not
scraped — manually curated to ensure clean, connected graph data.

---

## Step 5: API Routes

All queries use parameterized Cypher (`$id`, `$fromId`, `$toId`, `$q`).
All route handlers wrap queries in try/catch and return proper HTTP status
codes with JSON error bodies.

### GET /api/search?q=
Case-insensitive search across Person.name and Movie.title.
```cypher
MATCH (p:Person)
WHERE toLower(p.name) CONTAINS toLower($q)
RETURN p, 'person' AS type
UNION
MATCH (m:Movie)
WHERE toLower(m.title) CONTAINS toLower($q)
RETURN m, 'movie' AS type
```

### GET /api/person/[id]
Person details + filmography + direct co-stars (1-hop traversal).
```cypher
MATCH (p:Person {id: $id})
OPTIONAL MATCH (p)-[a:ACTED_IN]->(m:Movie)
OPTIONAL MATCH (p)-[:DIRECTED]->(dm:Movie)
OPTIONAL MATCH (p)-[:ACTED_IN]->(shared:Movie)<-[:ACTED_IN]-(coStar:Person)
WHERE coStar.id <> p.id
RETURN p, collect(DISTINCT {movie: m, role: a.role}) AS actedMovies,
       collect(DISTINCT dm) AS directedMovies,
       collect(DISTINCT coStar) AS coStars
```

### GET /api/path?fromId=&toId=
**The "awkward in SQL" query.** Shortest path between two Person nodes
via shared movies:
```cypher
MATCH (from:Person {id: $fromId}), (to:Person {id: $toId})
MATCH path = shortestPath(
  (from)-[:ACTED_IN|DIRECTED*..10]-(to)
)
RETURN [n IN nodes(path) |
  CASE
    WHEN n:Person THEN {type: 'person', id: n.id, name: n.name, imageUrl: n.imageUrl}
    WHEN n:Movie  THEN {type: 'movie',  id: n.id, name: n.title, imageUrl: n.posterUrl}
  END
] AS pathNodes
```
**Why this is awkward in SQL:** You'd need recursive CTEs traversing the
`person_movie` junction table, tracking visited nodes to avoid cycles, and
reconstructing the path — easily 50+ lines of SQL. Cypher's `shortestPath()`
does it in one clause.

### GET /api/recommend/[id]
2-hop traversal: co-stars of co-stars, ranked by shared connections:
```cypher
MATCH (p:Person {id: $id})-[:ACTED_IN]->(m:Movie)<-[:ACTED_IN]-(coStar:Person)
WHERE coStar.id <> p.id
MATCH (coStar)-[:ACTED_IN]->(m2:Movie)<-[:ACTED_IN]-(rec:Person)
WHERE rec.id <> p.id
  AND NOT (p)-[:ACTED_IN]->(:Movie)<-[:ACTED_IN]-(rec)
RETURN rec, count(DISTINCT coStar) AS sharedConnections,
       collect(DISTINCT coStar.name) AS connectedVia
ORDER BY sharedConnections DESC
LIMIT 10
```
**Why this is awkward in SQL:** Requires self-joins on the junction table
four times (person→movie→coStar→movie→rec), plus a NOT EXISTS subquery to
exclude direct co-stars, plus GROUP BY + ORDER BY for ranking.

---

## Step 6: UI Pages

### Search Page (`/`)
- Input with debounced live search (250ms)
- Loading: skeleton cards (not spinner-only)
- Empty: "No matches found — try a different name"
- Error: red-bordered card with retry button
- Results: cards with avatar/poster thumbnail, name, description, type badge

### Person Page (`/person/:id`)
- Profile card with avatar, name, role, bio
- Filmography section with movie cards (role displayed)
- Co-stars grid with shared movie count
- "Find connection to..." input with person search dropdown
- Path rendered as horizontal chain of avatar nodes with arrows
- Recommendations ranked list with "connected via..." explanation
- All three states (loading/empty/error) on every data fetch

### Movie Page (`/movie/:id`)
- Movie header with poster, title, year, genres, overview
- Directors section
- Cast grid with role names
- All three states implemented

---

## Step 7: Deployment

**Vercel deployment (Next.js version):**
1. Push to GitHub
2. Import repo in Vercel
3. Set `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` as env vars
4. Deploy

**Current Vite version:**
The app runs entirely in-browser using the in-memory graph engine. No
database credentials needed. Download and `npm install && npm run dev`.

---

## Why Graph, Not Relational

For CineGraph, the core queries are **multi-hop traversals** through a
many-to-many network:

1. **Shortest path** between two people via shared movies — this is the
   defining use case. In Cypher, `shortestPath((a)-[:ACTED_IN*..10]-(b))`
   is a single built-in function. In SQL, you need recursive CTEs over
   junction tables with cycle detection and path reconstruction.

2. **Co-star recommendations** — 2-hop traversal with ranking. In Cypher,
   it's a MATCH chain. In SQL, it's 4 self-joins on a junction table plus
   a NOT EXISTS subquery.

3. **Co-star lookup** — 1-hop traversal. In Cypher, one MATCH. In SQL,
   a JOIN on the junction table with a self-join on Person.

Graph databases store relationships as first-class citizens — traversing
them is O(degree), not O(table scan + join). For a network exploration app,
this is the natural data model.

---

## Why Queries Are Parameterized

Parameterized queries pass values separately from the Cypher text:
```typescript
session.run("MATCH (p:Person {id: $id}) RETURN p", { id: "p1" })
```

**What breaks if you don't:**
- **Cypher injection:** A malicious input like `" OR 1=1 //` could alter
  the query logic, extract data, or delete nodes.
- **Performance:** The query planner caches plans for parameterized queries.
  String-concatenated queries force re-planning every time.
- **Type safety:** Parameters preserve types (numbers stay numbers).
  String interpolation converts everything to text.

---

## Error Handling

**When CognoDB is unreachable:**
1. `getDriver()` throws: "Database not configured" or "Failed to connect"
2. `runQuery()` catches and re-throws: "Query failed: <message>"
3. API route catches and returns: `Response.json({ error: "Database unreachable" }, { status: 503 })`
4. UI `api.ts` function catches and throws a user-friendly error
5. React component catches in try/catch, sets `error` state
6. UI shows error card with message + Retry button
7. Process never crashes — user can retry

---

## Codebase Walkthrough

```
src/
  App.tsx                    — Router setup (3 routes)
  main.tsx                   — React entry + ThemeProvider
  index.css                  — Tailwind + theme tokens
  pages/
    SearchPage.tsx           — Landing/search page
    PersonPage.tsx           — Person detail + path finder + recommendations
    MoviePage.tsx            — Movie detail + cast/crew
  components/
    cinegraph/
      PathChain.tsx          — Horizontal path visualization
    ui/                      — shadcn/ui components (Button, Card, etc.)
  lib/
    api.ts                   — API service layer (browser-side)
    graph.ts                 — In-memory graph engine (BFS, traversal)
    db.ts                    — CognoDB driver singleton + Cypher queries
  data/
    seed.json                — Curated dataset (50 people, 18 movies)
scripts/
  seed.ts                    — CognoDB seeding script (Node.js)
```

**Request flow (current Vite version):**
1. User types in search → `SearchPage` calls `searchAPI()` in `lib/api.ts`
2. `api.ts` calls `graph.search()` in `lib/graph.ts` (in-memory)
3. `graph.ts` filters `seed.json` data and returns results
4. React renders results as cards

**Request flow (production Next.js version):**
1. User types → `SearchPage` calls `fetch("/api/search?q=...")`
2. Next.js route handler calls `runQuery(CYPHER_QUERIES.search, { q })`
3. `lib/db.ts` sends parameterized Cypher to CognoDB via neo4j-driver
4. CognoDB executes query, returns records
5. Route handler formats JSON response
6. React renders results

The swap is a one-file change per function in `lib/api.ts`.
