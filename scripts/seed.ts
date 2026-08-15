/**
 * CineGraph Seed Script
 *
 * Loads the seed dataset into a CognoDB / Neo4j instance using parameterized
 * Cypher UNWIND + MERGE queries. Idempotent — safe to re-run.
 *
 * Usage:
 *   npm run seed
 *
 * Environment variables (read from .env.local, or the shell environment):
 *   NEO4J_URI=bolt+s://<instance>.cognodb.cloud
 *   NEO4J_USER=cognodb
 *   NEO4J_PASSWORD=<your-password>
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import neo4j from "neo4j-driver";
import type { Driver } from "neo4j-driver";
import seedData from "../src/data/seed.json";

loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"));

const URI = process.env["NEO4J_URI"] ?? "";
const USER = process.env["NEO4J_USER"] ?? "cognodb";
const PASSWORD = process.env["NEO4J_PASSWORD"] ?? "";

/** Populates process.env from a KEY=value file. Existing env vars win. */
function loadEnvFile(path: string) {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of contents.split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

async function main() {
  if (!URI || !PASSWORD) {
    console.error("Missing NEO4J_URI or NEO4J_PASSWORD environment variables.");
    console.error("Set them before running: export NEO4J_URI=... && export NEO4J_PASSWORD=...");
    process.exit(1);
  }

  const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));

  try {
    console.log("Connected to CognoDB. Seeding data...\n");

    // 1. Create People
    console.log(`Creating ${seedData.people.length} Person nodes...`);
    await runQuery(driver, `
      UNWIND $people AS person
      MERGE (p:Person {id: person.id})
      SET p.name = person.name,
          p.bio = person.bio,
          p.imageUrl = person.imageUrl,
          p.role = person.role,
          p.industry = person.industry
    `, { people: seedData.people });
    console.log("  Done.");

    // 2. Create Movies
    console.log(`Creating ${seedData.movies.length} Movie nodes...`);
    await runQuery(driver, `
      UNWIND $movies AS movie
      MERGE (m:Movie {id: movie.id})
      SET m.title = movie.title,
          m.year = movie.year,
          m.posterUrl = movie.posterUrl,
          m.overview = movie.overview,
          m.industry = movie.industry
    `, { movies: seedData.movies });
    console.log("  Done.");

    // 3. Create Genres
    console.log(`Creating ${seedData.genres.length} Genre nodes...`);
    await runQuery(driver, `
      UNWIND $genres AS genre
      MERGE (g:Genre {name: genre.name})
    `, { genres: seedData.genres });
    console.log("  Done.");

    // 4. Create ACTED_IN relationships
    console.log(`Creating ${seedData.actedIn.length} ACTED_IN relationships...`);
    await runQuery(driver, `
      UNWIND $rels AS rel
      MATCH (p:Person {id: rel.personId}), (m:Movie {id: rel.movieId})
      MERGE (p)-[r:ACTED_IN]->(m)
      SET r.role = rel.role
    `, { rels: seedData.actedIn });
    console.log("  Done.");

    // 5. Create DIRECTED relationships
    console.log(`Creating ${seedData.directed.length} DIRECTED relationships...`);
    await runQuery(driver, `
      UNWIND $rels AS rel
      MATCH (p:Person {id: rel.personId}), (m:Movie {id: rel.movieId})
      MERGE (p)-[:DIRECTED]->(m)
    `, { rels: seedData.directed });
    console.log("  Done.");

    // 6. Create IN_GENRE relationships
    console.log(`Creating ${seedData.movieGenres.length} IN_GENRE relationships...`);
    await runQuery(driver, `
      UNWIND $rels AS rel
      MATCH (m:Movie {id: rel.movieId}), (g:Genre {name: rel.genre})
      MERGE (m)-[:IN_GENRE]->(g)
    `, { rels: seedData.movieGenres });
    console.log("  Done.");

    // Summary
    const summary = await runQuery(driver, `
      MATCH (n) RETURN
        sum(CASE WHEN n:Person THEN 1 ELSE 0 END) AS people,
        sum(CASE WHEN n:Movie THEN 1 ELSE 0 END) AS movies,
        sum(CASE WHEN n:Genre THEN 1 ELSE 0 END) AS genres
    `, {});
    const stats = summary[0];
    console.log("\n── Seed complete ──────────────────────");
    console.log(`  People:        ${stats["people"]}`);
    console.log(`  Movies:        ${stats["movies"]}`);
    console.log(`  Genres:        ${stats["genres"]}`);
    console.log(`  ACTED_IN:      ${seedData.actedIn.length}`);
    console.log(`  DIRECTED:      ${seedData.directed.length}`);
    console.log(`  IN_GENRE:      ${seedData.movieGenres.length}`);
    console.log("───────────────────────────────────────");
  } catch (err) {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await driver.close();
  }
}

async function runQuery(
  driver: Driver,
  cypher: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const session = driver.session();
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => r.toObject());
  } finally {
    await session.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
