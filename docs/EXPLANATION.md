# CineGraph - Architectural & Engineering Breakdown

> **Note on scope:** the sections below describe the full client/server design,
> including the Next.js route handlers that back a live CognoDB deployment. The
> code in this repository ships the client half of that design: a Vite SPA whose
> `src/lib/api.ts` currently resolves against the in-memory engine in
> `src/lib/graph.ts`, with the Cypher layer kept in `src/lib/db.ts`. See the
> README for the deployed architecture.

This document provides a technical deep-dive into the architectural decisions, graph data modeling rationale, Cypher query mechanics, security practices, and error handling strategies implemented in **CineGraph**.

---

## 1. Why Graph, Not Relational? (Graph vs. RDBMS)

### The Core Problem in Relational Databases (SQL)
In a relational database (like PostgreSQL or MySQL), network relationships between talent (actors, directors) and movies are stored across normalized junction tables (`people`, `movies`, `person_movie_roles`). 

Executing graph operations like **Six Degrees of Separation (Shortest Path)** or **2-Hop Co-Star Recommendations** in SQL requires:
1. **Multiple Recursive Common Table Expressions (CTEs)** or `N` self-joins.
2. **Exponential Join Explosion**: Joining `Person` → `Movie_Cast` → `Person` → `Movie_Cast` → `Person` forces SQL engines to perform full index scans and heavy hash joins over massive tables.
3. **Fixed Depth vs. Arbitrary Depth**: In SQL, finding paths of arbitrary length requires recursive CTEs that are notoriously difficult to optimize and prone to infinite loops or stack overflows without hardcoded iteration bounds.

### The Solution in Graph Databases (openCypher / CognoDB)
In **CognoDB** (Neo4j Bolt protocol compatible):
- **Index-Free Adjacency**: Nodes maintain direct pointer references to their connected relationships and neighbor nodes. Traversing from an Actor node to a Movie node is an \(O(1)\) pointer dereference operation, independent of the total size of the database.
- **Declarative Path Finding**: openCypher provides native `shortestPath((p1)-[:ACTED_IN|DIRECTED*..10]-(p2))` pattern matching, which uses bidirectional Breadth-First Search (BFS) directly over graph pointers.
- **Multi-Hop Traversal Performance**: A 2-hop traversal `(p:Person)-[:ACTED_IN]->(:Movie)<-[:ACTED_IN]-(coStar)-[:ACTED_IN]->(:Movie)<-[:ACTED_IN]-(rec:Person)` executes in milliseconds because it only visits adjacent memory pointers rather than scanning relational tables.

---

## 2. Data Model Design & Tradeoffs

```
               (:Person {id, name, bio, imageUrl})
                                 |
                 +---------------+---------------+
                 |                               |
          [ACTED_IN {role}]                 [DIRECTED]
                 |                               |
                 v                               v
               (:Movie {id, title, year, posterUrl, overview})
                                 |
                            [IN_GENRE]
                                 |
                                 v
                          (:Genre {name})
```

### Why This Specific Shape?
- **Nodes**:
  - `:Person`: Represents actors, directors, and creators. We combine actors and directors into a single `:Person` label because an individual often acts AND directs across their career (e.g. Quentin Tarantino, Bradley Cooper, Greta Gerwig).
  - `:Movie`: Represents feature films with essential metadata (`id`, `title`, `year`, `posterUrl`, `overview`).
  - `:Genre`: Separate nodes for genres (`:Genre {name: 'Sci-Fi'}`) allow fast graph grouping and genre-based path discovery.
- **Relationships**:
  - `(:Person)-[:ACTED_IN {role}]->(:Movie)`: Stores the specific character `role` (e.g. `role: "Dom Cobb"`) directly on the relationship edge properties.
  - `(:Person)-[:DIRECTED]->(:Movie)`: Clean directional edge indicating directorial credit.
  - `(:Movie)-[:IN_GENRE]->(:Genre)`: Links movies to their genres.

### Alternative Shapes Considered & Tradeoffs:
- *Alternative 1*: Creating separate `:Actor` and `:Director` node labels.
  - *Tradeoff*: Would require duplicate nodes or complex multi-label management when a person both directs and acts in the same movie. Single `:Person` label with typed relationships (`:ACTED_IN` vs `:DIRECTED`) is cleaner and more flexible.
- *Alternative 2*: Embedding roles inside an array property on `:Person`.
  - *Tradeoff*: Destroys the graph topology. Storing role edges as first-class relationships makes co-star graph matching trivial.

---

## 3. Cypher Query Breakdown

### Query A: Variable-Length Shortest Path ("Six Degrees" Tool)
```cypher
MATCH (p1:Person {id: $fromId}), (p2:Person {id: $toId})
MATCH path = shortestPath((p1)-[:ACTED_IN|DIRECTED*..10]-(p2))
RETURN 
  nodes(path) AS nodes,
  length(path) AS degree
```
**Clause Breakdown**:
- `MATCH (p1:Person {id: $fromId}), (p2:Person {id: $toId})`: Uses node property lookup to anchor the start node `p1` and target node `p2`.
- `shortestPath(...)`: Built-in openCypher function that executes bidirectional Breadth-First Search (BFS) to find the path with the minimum number of relationship hops.
- `(p1)-[:ACTED_IN|DIRECTED*..10]-(p2)`: Matches undirected paths between `p1` and `p2` over either `ACTED_IN` or `DIRECTED` relationships up to a max depth of 10 hops (`*..10`).
- `nodes(path)`: Returns the ordered sequence of nodes (`Person` → `Movie` → `Person` → `Movie` → `Person`) along the path.
- `length(path)`: Returns the integer count of relationship hops.

### Query B: 2-Hop Co-Star Recommendation Engine
```cypher
MATCH (p:Person {id: $id})-[:ACTED_IN]->(:Movie)<-[:ACTED_IN]-(coStar:Person)-[:ACTED_IN]->(m:Movie)<-[:ACTED_IN]-(rec:Person)
WHERE rec.id <> $id 
  AND NOT (p)-[:ACTED_IN]->(:Movie)<-[:ACTED_IN]-(rec)
WITH rec, count(DISTINCT m) AS sharedCount, collect(DISTINCT m.title) AS sharedMovies, collect(DISTINCT coStar.name) AS connectedVia
RETURN 
  rec, 
  sharedCount, 
  sharedMovies[0..3] AS sharedMovies, 
  connectedVia[0..3] AS connectedVia
ORDER BY sharedCount DESC, rec.name ASC
LIMIT 10
```
**Clause Breakdown**:
- `MATCH (p)-[:ACTED_IN]->(:Movie)<-[:ACTED_IN]-(coStar)-[:ACTED_IN]->(m:Movie)<-[:ACTED_IN]-(rec)`: Traverses a 4-relationship (2-person hop) chain: target person `p` → shared movie 1 → 1-hop coStar → shared movie 2 → 2-hop recommended person `rec`.
- `WHERE rec.id <> $id AND NOT (p)-[:ACTED_IN]->(:Movie)<-[:ACTED_IN]-(rec)`: Filters out the source person `p` and excludes anyone who is already a direct 1-hop co-star of `p`.
- `WITH rec, count(DISTINCT m) AS sharedCount, collect(DISTINCT m.title) AS sharedMovies, collect(DISTINCT coStar.name) AS connectedVia`: Aggregates candidates by counting unique intermediate movies `m` and collecting connector co-stars `coStar`.
- `ORDER BY sharedCount DESC LIMIT 10`: Ranks recommendations by total number of shared connection paths.

---

## 4. Query Parameterization & Security (Injection Prevention)

### Why Parameterization is Critical
In openCypher (as in SQL), constructing queries via string concatenation:
```typescript
// ❌ DANGEROUS - VULNERABLE TO CYPHER INJECTION
const cypher = `MATCH (p:Person) WHERE p.name = '${userInput}' RETURN p`;
```
allows attackers to inject arbitrary Cypher statements (e.g. `' OR true WITH p DETACH DELETE p //`). This can result in complete data deletion or unauthorized data extraction.

### Our Implementation in `lib/db.ts`
All Cypher queries in CineGraph strictly pass parameters in the driver call:
```typescript
// ✅ SECURE - PARAMETERIZED CYPHER QUERY
const cypher = `MATCH (p:Person) WHERE toLower(p.name) CONTAINS $query RETURN p`;
await runQuery(cypher, { query: lowerQ });
```
- **Driver Escaping**: The Neo4j / CognoDB driver serializes `$query` separately over the Bolt binary protocol. The query engine compiles the execution plan once and treats parameters strictly as literal values, completely neutralizing injection risks.

---

## 5. Error Handling & Resilience Strategy

### What happens if CognoDB is unreachable?
1. **Singleton Resilience**: `lib/db.ts` wraps driver initialization and query execution in `try / catch` blocks.
2. **Typed Error (`DbConnectionError`)**: Any network failure (`ECONNREFUSED`, `ENOTFOUND`, `SessionExpired`, `ServiceUnavailable`) is caught and thrown as a `DbConnectionError` with an HTTP status code `503 Service Unavailable`.
3. **API Layer Safety (`handleApiError`)**: Route handlers (`/app/api/person/[id]/route.ts`, etc.) catch `DbConnectionError` and return structured JSON responses:
   ```json
   {
     "error": "Database Unreachable",
     "message": "Unable to connect to CognoDB Cloud database instance. Verify host address and network connectivity.",
     "timestamp": "2026-08-13T23:55:00.000Z font-mono"
   }
   ```
4. **UI Recovery (`ErrorView`)**: The frontend React components render an `ErrorView` card featuring a friendly explanation and a **"Retry Connection"** button, preventing process crashes or blank screens.

---

## 6. Codebase Architecture & Request Flow

```
User Action (Click / Search / Path Selection)
     │
     ▼
Next.js React Client Component (e.g. /app/person/[id]/page.tsx)
     │
     ▼  fetch('/api/path?fromId=p2&toId=p3')
Next.js Route Handler (/app/api/path/route.ts)
     │
     ▼  runQuery(cypher, params)
DB Service Layer (/lib/db.ts)
     │
     ▼  Bolt 5.0+ Protocol over TLS (bolt+s://)
CognoDB Managed Graph Cloud Database
     │
     ▼  Returns Graph Records / Paths
Next.js API Handler parses nodes & relationships
     │
     ▼  JSON Response { degree: 2, pathNodes: [...] }
UI Renders Interactive Path Chain (<PathVisualizer />)
```

### Key Directories & Roles:
- `/app`: Next.js 14 App Router pages (`/`, `/person/[id]`, `/movie/[id]`) and API handlers (`/api/...`).
- `/lib/db.ts`: Neo4j driver singleton, `runQuery()` helper, and error handler.
- `/scripts/seed.ts`: Parameterized batch seed script using `UNWIND` + `MERGE`.
- `/data/seed.json`: Curated dataset with ~500 nodes & relationships.
- `/components`: Reusable UI components (`PathVisualizer`, `Navbar`, `Footer`, `LoadingSkeleton`, `ErrorView`, `EmptyView`).
