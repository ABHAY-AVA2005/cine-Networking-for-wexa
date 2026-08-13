# 🎯 CineGraph - CognoDB Take-Home Assignment Interview Preparation Guide

This document is specifically tailored for your follow-up interview with the **Wexa AI** engineering team. It synthesizes the exact evaluation criteria from `CognoDB-Assignment-2-Application.docx.pdf`, breaks down what the interviewers are looking for, and equips you with both **Executive Briefs** and **Line-by-Line Technical Explanations** to confidently defend every aspect of CineGraph.

---

## 📌 PART 1: Executive Summary & Evaluation Criteria

### What is Wexa AI Evaluating?
According to the assignment spec, Wexa AI is assessing 4 core pillars:

| Evaluation Pillar | What They Assess | How CineGraph Delivers |
| :--- | :--- | :--- |
| **1. Data Modeling & Graph Rationale** | Can you justify why a graph database is superior to relational SQL for this domain? | Modeled entities as labeled nodes (`Person`, `Movie`, `Genre`) with typed edges (`ACTED_IN`, `DIRECTED`, `IN_GENRE`). Solves SQL's exponential join problem. |
| **2. Cypher Query Engineering** | Do you understand multi-hop graph traversals, openCypher syntax, and parameterization security? | Implemented `shortestPath()` for Six Degrees (variable length traversal) & 2-hop co-star recommendation engine. **100% Parameterized** via `neo4j-driver`. |
| **3. Engineering Architecture & Resilience** | Is the code production-ready, clean, secure, and resilient to failure? | Singleton Neo4j driver, Next.js 14 App Router, credentials strictly in `.env.local`, custom `DbConnectionError` & `ErrorView` retry states. |
| **4. UI/UX & Product Design** | Is the application accessible to a non-technical user with polished feedback states? | Modern cinematic glassmorphism layout with explicit **Loading Skeletons**, **Empty States**, **Error States**, and interactive visual path chains (`PathVisualizer`). |

---

## 💡 PART 2: Core Concept Deep-Dives & Interview Answers

---

### Q1. "Why did you choose a Graph Database over a Relational SQL Database for CineGraph?"

#### ⚡ 30-Second Elevator Pitch:
> "In movie talent networks, the most valuable queries are about relationships—like finding the shortest path between two actors or discovering co-stars of co-stars. In SQL, answering these requires recursive CTEs and multiple self-joins over giant junction tables, resulting in exponential join explosion and slow $O(N^k)$ query performance. In CognoDB/Cypher, relationships are stored as direct memory pointers—a concept called **Index-Free Adjacency**. Traversing from an actor to a movie is an $O(1)$ pointer lookup regardless of database size, enabling multi-hop path traversal in milliseconds."

#### 🔬 Detailed Explanation:
- **Relational SQL Bottleneck**: To find a path of length 6 between two actors in SQL, you have to join `People` → `Cast` → `Movies` → `Cast` → `People` → `Cast` → `Movies` → `Cast` → `People`. The database engine scans table indexes at every step, creating a massive cartesian product.
- **Graph / openCypher Solution**: In CognoDB, nodes contain physical pointers to their edges. Cypher's `shortestPath()` engine performs a bidirectional Breadth-First Search (BFS) directly following memory pointers. Query complexity is bounded strictly by the local neighborhood degree, not total table rows.

---

### Q2. "Walk me through your Data Model design."

#### ⚡ 30-Second Pitch:
> "We modeled labeled nodes `(:Person)`, `(:Movie)`, and `(:Genre)`. `Person` represents both actors and directors to handle dual roles seamlessly. Relationships are typed: `(:Person)-[:ACTED_IN {role}]->(:Movie)`, `(:Person)-[:DIRECTED]->(:Movie)`, and `(:Movie)-[:IN_GENRE]->(:Genre)`. Edge properties like `{role: 'Dom Cobb'}` keep attributes directly on the connection edge."

#### 🔬 Node & Relationship Schema:

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

- **Why single `:Person` label instead of separate `:Actor` / `:Director`?**
  Many industry professionals both act and direct (e.g. Quentin Tarantino, Bradley Cooper, Greta Gerwig, S.S. Rajamouli). A single `:Person` label with separate `ACTED_IN` and `DIRECTED` relationship types avoids duplicate nodes and supports dual roles naturally.

---

### Q3. "Explain your Cypher queries line-by-line, especially the multi-hop and shortest path queries."

#### Query 1: Six Degrees Shortest Path (`/api/path/route.ts`)
```cypher
MATCH (p1:Person {id: $fromId}), (p2:Person {id: $toId})
MATCH path = shortestPath((p1)-[:ACTED_IN|DIRECTED*..10]-(p2))
RETURN 
  nodes(path) AS nodes,
  length(path) AS degree
```
- `MATCH (p1:Person {id: $fromId}), (p2:Person {id: $toId})`: Uses node property lookup to anchor source (`p1`) and target (`p2`) nodes.
- `shortestPath(...)`: Built-in openCypher function that executes bidirectional BFS traversal.
- `(p1)-[:ACTED_IN|DIRECTED*..10]-(p2)`: Matches undirected paths between `p1` and `p2` over `ACTED_IN` or `DIRECTED` relationships up to 10 hops (`*..10`).
- `nodes(path)`: Returns the ordered list of nodes in path sequence (`Person` → `Movie` → `Person` → `Movie`...).
- `length(path)`: Returns the total number of relationship edges in the shortest path.

#### Query 2: 2-Hop Co-Star Recommendation Engine (`/api/recommend/[id]/route.ts`)
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
- `MATCH (p)-[:ACTED_IN]->(:Movie)<-[:ACTED_IN]-(coStar)-[:ACTED_IN]->(m:Movie)<-[:ACTED_IN]-(rec)`: Traverses a 4-relationship (2-person hop) chain: Source person `p` → 1-hop coStar → shared movie `m` → 2-hop recommended person `rec`.
- `WHERE rec.id <> $id AND NOT (p)-[:ACTED_IN]->(:Movie)<-[:ACTED_IN]-(rec)`: Ensures candidate `rec` is not the source person AND excludes anyone who is already a direct 1-hop co-star of `p`.
- `WITH rec, count(DISTINCT m) AS sharedCount...`: Groups candidates and calculates total shared connection paths (`sharedCount`).
- `ORDER BY sharedCount DESC LIMIT 10`: Ranks top 10 recommended talent by network strength.

---

### Q4. "Why are queries parameterized? What breaks if they aren't?"

#### ⚡ 30-Second Pitch:
> "Query parameterization separates query logic from user input. In Cypher, concatenating user strings directly into query text creates **Cypher Injection** vulnerabilities. Parameterization sends parameters over the binary Bolt protocol separately, allowing the database to compile execution plans safely without evaluating user text as executable code."

#### 🔬 Security Analysis:
- **Vulnerable Code (String Concatenation)**:
  ```typescript
  // ❌ VULNERABLE TO CYPHER INJECTION
  const cypher = `MATCH (p:Person) WHERE p.name = '${userInput}' RETURN p`;
  ```
  If `userInput` is `' OR true WITH p DETACH DELETE p //`, the injected Cypher statement executes `DETACH DELETE p`, wiping nodes from the database.
- **Secure Code in `lib/db.ts`**:
  ```typescript
  // ✅ SECURE PARAMETERIZATION
  const cypher = `MATCH (p:Person) WHERE toLower(p.name) CONTAINS $query RETURN p`;
  await runQuery(cypher, { query: lowerQ });
  ```
  The Neo4j driver serializes `$query` separately. CognoDB treats the parameter strictly as a literal string value.

---

### Q5. "How does your app handle database connection failures or CognoDB outages?"

#### ⚡ 30-Second Pitch:
> "We use a layered error handling strategy. `lib/db.ts` wraps driver initialization and session execution in try/catch blocks, throwing a custom `DbConnectionError` with HTTP status 503. API route handlers catch this and return clean JSON bodies instead of crashing Node.js. On the frontend, React components render an explicit `ErrorView` card with a 'Retry Connection' button."

#### 🔬 Failure Architecture Flow:

```
[CognoDB Outage / Invalid Credentials]
                 │
                 ▼
[lib/db.ts] Catches Bolt Exception → Throws DbConnectionError(503)
                 │
                 ▼
[Next.js API Handler] Catches Error → Returns HTTP 503 { error: "Database Unreachable" }
                 │
                 ▼
[React UI Page] Receives 503 → Renders <ErrorView message="..." onRetry={refetch} />
```

---

### Q6. "Walk me through your Codebase Architecture and Request Lifecycle."

```
/app
  /page.tsx                     -> Landing page, search bar, Six Degrees widget
  /person/[id]/page.tsx         -> Person profile, filmography, 1-hop co-stars, 2-hop recs
  /movie/[id]/page.tsx          -> Movie details, cast grid with roles, directors
  /api/search/route.ts          -> Parameterized search API
  /api/person/[id]/route.ts     -> Person details API
  /api/movie/[id]/route.ts      -> Movie details API
  /api/path/route.ts            -> Shortest path Cypher API
  /api/recommend/[id]/route.ts -> 2-hop recommendations API
/lib/db.ts                      -> Driver singleton, runQuery(), error handler
/scripts/seed.ts                -> Parameterized UNWIND + MERGE seeder
/data/seed.json                 -> Global cinema dataset (Hollywood, Tollywood, Bollywood, Kollywood, Mollywood)
```

#### Request Flow Example: User Clicks "Connect" (Six Degrees Tool)
1. User selects `Prabhas` (fromId) and `Deepika Padukone` (toId) in `app/page.tsx`.
2. Frontend issues `fetch('/api/path?fromId=p6&toId=p10')`.
3. Next.js App Router route handler (`/app/api/path/route.ts`) validates parameters and calls `runQuery(cypher, { fromId, toId })`.
4. `lib/db.ts` opens a session on the shared `neo4j.driver()` singleton over TLS (`bolt+s://`).
5. CognoDB executes bidirectional BFS `shortestPath()` over memory pointers and returns ordered path nodes (`Prabhas` → *Kalki 2898 AD* → `Deepika Padukone`).
6. API route maps graph records to clean JSON `{ found: true, degree: 2, pathNodes: [...] }`.
7. React UI renders the path as an interactive horizontal chain of avatar nodes (`PathVisualizer`).

---

## 🎯 Quick Cheat Sheet for Interview Day

1. **DB Driver**: Official `neo4j-driver` npm package connecting via `bolt+s://`.
2. **Key openCypher Clauses**: `UNWIND`, `MERGE`, `MATCH`, `shortestPath()`, `collect()`, `count()`.
3. **Primary Graph Advantage**: **Index-Free Adjacency** ($O(1)$ edge pointer lookups vs. $O(N^k)$ SQL joins).
4. **Global Dataset**: Covers Hollywood, Tollywood (*Baahubali, Kalki 2898 AD, RRR*), Bollywood (*Jawan, Pathaan*), Kollywood (*Vikram, Jailer*), Mollywood (*Drishyam, Manjummel Boys*), and South Korean cinema (*Parasite*).
5. **Security**: 100% Parameterized Cypher queries (`$query`, `$id`, `$fromId`, `$toId`).
