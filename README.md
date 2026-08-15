# CineGraph

A movie/TV talent-network explorer backed by a graph database (CognoDB / Neo4j-compatible).
Search for actors, directors, or movies; explore connections; find the shortest path
between any two people; and get co-star-based recommendations.

## Use Case

CineGraph lets you explore the Hollywood talent network as a graph:

- **Search** for any person or movie
- **View a person's profile** — filmography, co-stars, and directed works
- **Find the shortest connection** between two people (six degrees of Kevin Bacon)
- **Get recommendations** — "people you might know" based on shared co-stars

## Why a Graph Database?

CineGraph's core queries are **multi-hop traversals** through a many-to-many
network of people and movies. This is exactly what graph databases are built for.

### The Shortest Path Query (the "awkward in SQL" one)

Find the shortest connection between two people via shared movies:

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

In SQL, this requires:
- Recursive CTEs traversing the `person_movie` junction table
- Cycle detection (tracking visited nodes)
- Path reconstruction from parent pointers
- 50+ lines of code vs. one `shortestPath()` call

### The Recommendation Query (2-hop traversal)

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

In SQL, this needs 4 self-joins on the junction table plus a `NOT EXISTS`
subquery to exclude direct co-stars.

### Why not relational?

Graph databases store relationships as first-class citizens. Traversing a
relationship is O(degree) — you follow a pointer. In a relational database,
every hop is a JOIN over a junction table, which means O(n) scans at each
step. For a network exploration app, the graph model is the natural fit.

## Data Model

```
┌─────────────────┐       ┌──────────────────┐       ┌───────────┐
│     Person      │       │      Movie       │       │   Genre   │
├─────────────────┤       ├──────────────────┤       ├───────────┤
│ id (string)     │       │ id (string)      │       │ name (str) │
│ name (string)   │       │ title (string)   │       └───────────┘
│ bio (string)    │       │ year (int)       │            ▲
│ imageUrl (str)  │       │ posterUrl (str)  │            │
│ role (string)   │       │ overview (str)   │      IN_GENRE
└─────────────────┘       └──────────────────┘            │
       │                         ▲                  ┌────┴────┐
       │                         │                  │  Movie  │
  ACTED_IN {role}           DIRECTED               └─────────┘
       │                         │
       └─────────────────────────┘
```

**Nodes:**
- `(:Person {id, name, bio, imageUrl, role})`
- `(:Movie {id, title, year, posterUrl, overview})`
- `(:Genre {name})`

**Relationships:**
- `(:Person)-[:ACTED_IN {role}]->(:Movie)`
- `(:Person)-[:DIRECTED]->(:Movie)`
- `(:Movie)-[:IN_GENRE]->(:Genre)`

## Setup Instructions

### Option A: Run with In-Memory Engine (No Database Needed)

The app ships with an in-memory graph engine that uses the bundled seed data.
This works out of the box — no database credentials required.

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Option B: Connect to CognoDB Cloud

1. **Create a CognoDB Cloud instance**
   - Sign up at cognodb.cloud
   - Create a new database instance
   - Note the `bolt+s://` URI, username (`cognodb`), and password

2. **Configure environment variables**
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local with your credentials:
   # NEO4J_URI=bolt+s://<instance-id>.databases.cognodb.cloud
   # NEO4J_USER=cognodb
   # NEO4J_PASSWORD=<your-password>
   ```

3. **Seed the database**
   ```bash
   npm run seed
   ```
   The script reads `.env.local` (shell variables take precedence) and loads
   `src/data/seed.json` into the instance.

4. **Swap the API layer to use the live database**
   - `src/lib/db.ts` holds the driver and Cypher queries. It is server-side
     code: a browser cannot open a Bolt connection, so using it requires a
     backend (Vercel serverless functions, Express, or a Next.js port).
   - In `src/lib/api.ts`, replace each function body with a `fetch()` call to
     that backend endpoint.

## Deployment (Vercel)

The repo is deploy-ready as a static SPA:

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | 22 (see `.nvmrc`, `engines.node >= 20.19.0`) |

`vercel.json` pins those settings and adds a rewrite of every path to
`/index.html` so React Router routes (`/person/:id`, `/movie/:id`) survive a
hard refresh or direct link.

1. Push the branch to GitHub and import the repo in Vercel.
2. Deploy — no environment variables are needed for the in-memory build.
3. Only if you wire up a backend: add `NEO4J_URI`, `NEO4J_USER`,
   `NEO4J_PASSWORD` (Production + Preview). Never commit them.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server on `http://localhost:5173` |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript project check, no emit |
| `npm run lint` | ESLint over the project |
| `npm run seed` | Load `src/data/seed.json` into CognoDB/Neo4j |

## Main Queries

### Search (`/api/search?q=`)
Case-insensitive search across Person and Movie nodes:
```cypher
MATCH (p:Person)
WHERE toLower(p.name) CONTAINS toLower($q)
RETURN p, 'person' AS type
UNION
MATCH (m:Movie)
WHERE toLower(m.title) CONTAINS toLower($q)
RETURN m, 'movie' AS type
```

### Person Detail (`/api/person/[id]`)
1-hop traversal: person + their movies + direct co-stars:
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

### Shortest Path (`/api/path?fromId=&toId=`)
See the "Why a Graph Database?" section above.

### Recommendations (`/api/recommend/[id]`)
See the "Why a Graph Database?" section above.

## Why Queries Are Parameterized

All Cypher queries use parameters (`$id`, `$q`, `$fromId`) rather than
string interpolation. This prevents Cypher injection (analogous to SQL
injection) and allows the query planner to cache execution plans.

## Error Handling

If CognoDB is unreachable:
- The database driver throws a connection error
- `runQuery()` catches it and throws a typed error
- API routes catch the error and return HTTP 503 with a JSON error body
- The UI displays a friendly error message with a Retry button
- The application process never crashes

## Tech Stack

- **Frontend:** React + TypeScript + Tailwind CSS + shadcn/ui
- **Routing:** React Router
- **Graph Engine:** In-memory BFS (production: neo4j-driver → CognoDB)
- **Build Tool:** Vite

## Project Structure

```
.
├── index.html                    — Vite entry HTML
├── vercel.json                   — Vercel build + SPA rewrite config
├── .nvmrc / .env.local.example   — Node version, env template
├── src/
│   ├── main.tsx                  — React entry
│   ├── App.tsx                   — Router (3 routes)
│   ├── pages/
│   │   ├── SearchPage.tsx        — Search/landing page
│   │   ├── PersonPage.tsx        — Person detail + path finder + recommendations
│   │   └── MoviePage.tsx         — Movie detail + cast/crew
│   ├── components/
│   │   ├── cinegraph/PathChain.tsx — Path visualization
│   │   └── ui/                   — shadcn/ui components
│   ├── lib/
│   │   ├── api.ts                — API service layer (swap point for a backend)
│   │   ├── graph.ts              — In-memory graph engine (BFS, 2-hop recs)
│   │   ├── db.ts                 — CognoDB driver + Cypher queries (server-side)
│   │   └── utils.ts
│   └── data/seed.json            — Curated dataset (68 people, 39 movies, 12 genres)
├── scripts/seed.ts               — CognoDB seeding script
└── docs/
    ├── EXPLANATION.md            — Design write-up
    ├── IMPLEMENTATION_LOG.md     — Step-by-step build log
    ├── INTERVIEW_PREP.md         — Assignment Q&A notes
    └── assignment-brief.pdf
```

## Known Limitations

- The bundled `seed.json` is illustrative demo data; some cast/director
  attributions are not factually accurate and a few people have no
  relationships yet.
- `src/lib/db.ts` and `scripts/seed.ts` are the only database-facing code.
  The deployed app runs entirely on the in-memory engine.
