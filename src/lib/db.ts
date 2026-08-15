/**
 * CognoDB / Neo4j Driver Singleton
 *
 * This file contains the production database integration using the official
 * neo4j-driver package. It reads credentials from environment variables
 * (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD) and is designed to be used
 * in a Node.js server context (Next.js API routes, Express, etc.).
 *
 * ── HOW TO USE IN A NEXT.JS OR NODE.JS BACKEND ──────────────────────────────
 *
 * 1. Install:  npm install neo4j-driver
 * 2. Set env:  NEO4J_URI=bolt+s://<instance>.cognodb.cloud
 *              NEO4J_USER=cognodb
 *              NEO4J_PASSWORD=<your-password>
 * 3. Import:   import { runQuery } from "@/lib/db"
 * 4. Query:    const result = await runQuery(
 *                "MATCH (p:Person {id: $id}) RETURN p",
 *                { id: "p1" }
 *              )
 *
 * ── CURRENT SETUP ────────────────────────────────────────────────────────────
 *
 * This Vite/React app uses an in-memory graph engine (src/lib/graph.ts) instead
 * of a live database, so it works out of the box without any credentials.
 * The Cypher queries below mirror EXACTLY what the in-memory engine does.
 *
 * ── SWAPPING TO LIVE DATABASE ───────────────────────────────────────────────
 *
 * Replace the mock api calls in src/lib/api.ts with calls to runQuery() below.
 */

// ── Cypher query reference ───────────────────────────────────────────────────
// These are the exact queries the production app would run against CognoDB.

export const CYPHER_QUERIES = {
  /**
   * Search for Person or Movie nodes matching a query string (case-insensitive).
   * Parameterized: $q is the search term — prevents Cypher injection.
   */
  search: `
    CALL {
      MATCH (p:Person)
      WHERE toLower(p.name) CONTAINS toLower($q)
      RETURN p.id AS id, p.name AS name, p.imageUrl AS imageUrl, 'person' AS type
      LIMIT 10
      UNION
      MATCH (m:Movie)
      WHERE toLower(m.title) CONTAINS toLower($q)
      RETURN m.id AS id, m.title AS name, m.posterUrl AS imageUrl, 'movie' AS type
      LIMIT 10
    }
    RETURN id, name, imageUrl, type
    LIMIT 20
  `,

  /**
   * Get full person details: their movies (acted + directed) and direct co-stars.
   * The 1-hop co-star query is trivial in Cypher but requires 3 SQL JOINs.
   */
  personDetail: `
    MATCH (p:Person {id: $id})
    OPTIONAL MATCH (p)-[acted:ACTED_IN]->(m:Movie)
    OPTIONAL MATCH (p)-[:DIRECTED]->(dm:Movie)
    OPTIONAL MATCH (p)-[:ACTED_IN]->(shared:Movie)<-[:ACTED_IN]-(coStar:Person)
    WHERE coStar.id <> p.id
    RETURN p,
           collect(DISTINCT {movie: m, role: acted.role}) AS actedMovies,
           collect(DISTINCT dm) AS directedMovies,
           collect(DISTINCT coStar) AS coStars
  `,

  /**
   * Shortest path between two Person nodes — the "awkward in SQL" query.
   * Cypher's shortestPath() makes this a single clause; SQL would require
   * recursive CTEs with cycle detection over multiple join tables.
   *
   * The path traverses ACTED_IN and DIRECTED relationships bidirectionally,
   * with a max depth of 10 hops to prevent expensive full-graph scans.
   */
  shortestPath: `
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
  `,

  /**
   * 2-hop recommendation: co-stars of co-stars, ranked by number of shared
   * mutual connections, excluding people already 1 hop away.
   * This is a classic graph traversal that would require multiple nested
   * subqueries and CTEs in SQL.
   */
  recommend: `
    MATCH (p:Person {id: $id})-[:ACTED_IN]->(m:Movie)<-[:ACTED_IN]-(coStar:Person)
    WHERE coStar.id <> p.id
    MATCH (coStar)-[:ACTED_IN]->(m2:Movie)<-[:ACTED_IN]-(rec:Person)
    WHERE rec.id <> p.id
      AND NOT (p)-[:ACTED_IN]->(:Movie)<-[:ACTED_IN]-(rec)
    RETURN rec,
           count(DISTINCT coStar) AS sharedConnections,
           collect(DISTINCT coStar.name) AS connectedVia
    ORDER BY sharedConnections DESC
    LIMIT 10
  `,

  /**
   * Seed script: UNWIND + MERGE ensures idempotent upserts.
   * Parameters prevent injection; batching improves write throughput.
   */
  seedPeople: `
    UNWIND $people AS person
    MERGE (p:Person {id: person.id})
    SET p.name = person.name,
        p.bio = person.bio,
        p.imageUrl = person.imageUrl
    RETURN count(p) AS created
  `,

  seedMovies: `
    UNWIND $movies AS movie
    MERGE (m:Movie {id: movie.id})
    SET m.title = movie.title,
        m.year = movie.year,
        m.posterUrl = movie.posterUrl,
        m.overview = movie.overview
    RETURN count(m) AS created
  `,

  seedActedIn: `
    UNWIND $rels AS rel
    MATCH (p:Person {id: rel.personId}), (m:Movie {id: rel.movieId})
    MERGE (p)-[r:ACTED_IN]->(m)
    SET r.role = rel.role
    RETURN count(r) AS created
  `,

  seedDirected: `
    UNWIND $rels AS rel
    MATCH (p:Person {id: rel.personId}), (m:Movie {id: rel.movieId})
    MERGE (p)-[:DIRECTED]->(m)
    RETURN count(*) AS created
  `,

  seedGenres: `
    UNWIND $genres AS genre
    MERGE (g:Genre {name: genre.name})
    RETURN count(g) AS created
  `,

  seedMovieGenres: `
    UNWIND $rels AS rel
    MATCH (m:Movie {id: rel.movieId}), (g:Genre {name: rel.genre})
    MERGE (m)-[:IN_GENRE]->(g)
    RETURN count(*) AS created
  `,
};

// ── Driver singleton (Node.js/Next.js only) ──────────────────────────────────
// This code runs on the server only. In a Vite SPA, import from graph.ts instead.

declare const process: { env: Record<string, string | undefined> } | undefined;

let _driver: unknown = null;

/**
 * Server-only driver getter. Reads env vars from process.env.
 * In a browser context this throws — use the in-memory graph engine instead.
 */
export async function getDriver() {
  if (_driver) return _driver;

  const env = (typeof process !== "undefined" && process ? process.env : {}) as Record<string, string | undefined>;
  const uri = env["NEO4J_URI"];
  const user = env["NEO4J_USER"];
  const password = env["NEO4J_PASSWORD"];

  if (!uri || !user || !password) {
    throw new Error(
      "Database not configured. Set NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD environment variables."
    );
  }

  try {
    // Dynamically import using a variable path so TS doesn't resolve the module
    const modulePath = "neo4j-driver";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const neo4j: any = await import(/* @vite-ignore */ modulePath);
    _driver = neo4j.default.driver(uri, neo4j.default.auth.basic(user, password));
    return _driver;
  } catch (err) {
    throw new Error(
      `Failed to connect to CognoDB: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err }
    );
  }
}

export async function runQuery(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown>[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const driver = await getDriver() as any;
  const session = driver.session();
  try {
    const result = await session.run(cypher, params);
    return result.records.map((record: { toObject: () => Record<string, unknown> }) => record.toObject());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Query failed: ${message}`, { cause: err });
  } finally {
    await session.close();
  }
}
