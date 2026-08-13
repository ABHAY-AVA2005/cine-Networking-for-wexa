/**
 * In-memory graph engine for CineGraph.
 * Implements the same traversal logic as the CognoDB/Neo4j Cypher queries,
 * but running entirely in-browser using the seed.json data.
 *
 * When you configure NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD (see .env.local.example),
 * swap the api.ts imports to use the Neo4j driver instead.
 */

import seedData from "@/data/seed.json";

export interface Person {
  id: string;
  name: string;
  bio: string;
  imageUrl: string;
  role: string;
  industry: string;
}

export interface Movie {
  id: string;
  title: string;
  year: number;
  posterUrl: string;
  overview: string;
  industry: string;
}

export interface Genre {
  name: string;
}

export interface ActedInRelation {
  personId: string;
  movieId: string;
  role: string;
}

export interface DirectedRelation {
  personId: string;
  movieId: string;
}

export interface MovieGenreRelation {
  movieId: string;
  genre: string;
}

export interface PersonWithMovies extends Person {
  movies: Array<Movie & { role?: string; isDirector?: boolean }>;
  coStars: Array<Person & { sharedMovies: string[] }>;
}

export interface MovieWithCast extends Movie {
  genres: string[];
  cast: Array<Person & { role: string }>;
  directors: Person[];
}

export interface PathNode {
  type: "person" | "movie";
  id: string;
  name: string;
  imageUrl: string;
  relationLabel?: string;
}

export interface RecommendationResult extends Person {
  sharedConnections: number;
  connectedVia: string[];
}

// ── Graph data loaded once ──────────────────────────────────────────────────

const people = seedData.people as Person[];
const movies = seedData.movies as Movie[];
const actedIn = seedData.actedIn as ActedInRelation[];
const directed = seedData.directed as DirectedRelation[];
const movieGenres = seedData.movieGenres as MovieGenreRelation[];

// Build lookup maps
const personById = new Map<string, Person>(people.map((p) => [p.id, p]));
const movieById = new Map<string, Movie>(movies.map((m) => [m.id, m]));

// ── Search ──────────────────────────────────────────────────────────────────

/**
 * Cypher equivalent:
 *   MATCH (n)
 *   WHERE (n:Person OR n:Movie)
 *     AND toLower(n.name) CONTAINS toLower($q)
 *   RETURN n LIMIT 20
 */
export function search(q: string, industryFilter?: string): Array<{ type: "person" | "movie"; data: Person | Movie }> {
  const lower = q.toLowerCase().trim();
  if (!lower) return [];

  const personResults = people
    .filter((p) => p.name.toLowerCase().includes(lower))
    .map((p) => ({ type: "person" as const, data: p }));

  const movieResults = movies
    .filter((m) =>
      m.title.toLowerCase().includes(lower) &&
      (!industryFilter || industryFilter === "all" || m.industry === industryFilter)
    )
    .map((m) => ({ type: "movie" as const, data: m }));

  return [...personResults, ...movieResults].slice(0, 20);
}

// ── Person detail ───────────────────────────────────────────────────────────

/**
 * Cypher equivalent:
 *   MATCH (p:Person {id: $id})
 *   OPTIONAL MATCH (p)-[r:ACTED_IN]->(m:Movie)
 *   OPTIONAL MATCH (p)-[:DIRECTED]->(dm:Movie)
 *   OPTIONAL MATCH (p)-[:ACTED_IN]->(m2:Movie)<-[:ACTED_IN]-(coStar:Person)
 *   WHERE coStar.id <> p.id
 *   RETURN p, collect(distinct m) as actedMovies, collect(distinct dm) as directedMovies,
 *          collect(distinct coStar) as coStars
 */
export function getPersonDetail(id: string): PersonWithMovies | null {
  const person = personById.get(id);
  if (!person) return null;

  // Movies acted in
  const actedMovieIds = actedIn
    .filter((r) => r.personId === id)
    .map((r) => ({ movieId: r.movieId, role: r.role }));

  // Movies directed
  const directedMovieIds = directed.filter((r) => r.personId === id).map((r) => r.movieId);

  const actedMovies = actedMovieIds.map(({ movieId, role }) => ({
    ...(movieById.get(movieId) as Movie),
    role,
    isDirector: false,
  }));

  const directedMovies = directedMovieIds
    .filter((mid) => !actedMovieIds.find((a) => a.movieId === mid))
    .map((mid) => ({
      ...(movieById.get(mid) as Movie),
      isDirector: true,
    }));

  const allMovieIds = new Set([
    ...actedMovieIds.map((a) => a.movieId),
    ...directedMovieIds,
  ]);

  // Co-stars: people who appeared in ANY of the same movies
  const coStarMap = new Map<string, { person: Person; sharedMovies: string[] }>();

  for (const movieId of allMovieIds) {
    const movie = movieById.get(movieId);
    if (!movie) continue;
    const others = actedIn.filter((r) => r.movieId === movieId && r.personId !== id);
    for (const rel of others) {
      const other = personById.get(rel.personId);
      if (!other) continue;
      if (!coStarMap.has(other.id)) {
        coStarMap.set(other.id, { person: other, sharedMovies: [] });
      }
      coStarMap.get(other.id)!.sharedMovies.push(movie.title);
    }
  }

  return {
    ...person,
    movies: [...actedMovies, ...directedMovies].sort((a, b) => b.year - a.year),
    coStars: Array.from(coStarMap.values()).map(({ person: p, sharedMovies }) => ({
      ...p,
      sharedMovies,
    })),
  };
}

// ── Movie detail ─────────────────────────────────────────────────────────────

/**
 * Cypher equivalent:
 *   MATCH (m:Movie {id: $id})
 *   OPTIONAL MATCH (p:Person)-[r:ACTED_IN]->(m)
 *   OPTIONAL MATCH (d:Person)-[:DIRECTED]->(m)
 *   OPTIONAL MATCH (m)-[:IN_GENRE]->(g:Genre)
 *   RETURN m, collect(distinct {person:p, role:r.role}) as cast,
 *          collect(distinct d) as directors,
 *          collect(distinct g.name) as genres
 */
export function getMovieDetail(id: string): MovieWithCast | null {
  const movie = movieById.get(id);
  if (!movie) return null;

  const cast = actedIn
    .filter((r) => r.movieId === id)
    .map((r) => ({
      ...(personById.get(r.personId) as Person),
      role: r.role,
    }));

  const directors = directed
    .filter((r) => r.movieId === id)
    .map((r) => personById.get(r.personId) as Person);

  const genres = movieGenres.filter((r) => r.movieId === id).map((r) => r.genre);

  return { ...movie, cast, directors, genres };
}

// ── Shortest path ────────────────────────────────────────────────────────────

/**
 * Cypher equivalent:
 *   MATCH path = shortestPath(
 *     (from:Person {id: $fromId})-[:ACTED_IN|DIRECTED*..10]-(to:Person {id: $toId})
 *   )
 *   RETURN [n in nodes(path) | {id: n.id, name: coalesce(n.name, n.title), labels: labels(n)}] as nodes
 *
 * We model this as a BFS over the bipartite Person–Movie graph.
 * Edges are Person→Movie (ACTED_IN or DIRECTED) and Movie→Person (reverse).
 */
export function shortestPath(fromId: string, toId: string): PathNode[] | null {
  if (fromId === toId) {
    const p = personById.get(fromId);
    if (!p) return null;
    return [{ type: "person", id: p.id, name: p.name, imageUrl: p.imageUrl }];
  }

  // BFS — each node in the queue is either a personId or movieId
  type GraphNode = { kind: "person" | "movie"; id: string };
  const start: GraphNode = { kind: "person", id: fromId };

  const visited = new Set<string>();
  const prev = new Map<string, { node: GraphNode; relationLabel: string }>();
  const queue: GraphNode[] = [start];
  visited.add(`person:${fromId}`);

  const key = (n: GraphNode) => `${n.kind}:${n.id}`;

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.kind === "person" && current.id === toId) {
      // Reconstruct path
      const path: PathNode[] = [];
      let node: GraphNode = current;
      while (node) {
        const data = prev.get(key(node));
        if (node.kind === "person") {
          const p = personById.get(node.id)!;
          path.unshift({
            type: "person",
            id: p.id,
            name: p.name,
            imageUrl: p.imageUrl,
            relationLabel: data?.relationLabel,
          });
        } else {
          const m = movieById.get(node.id)!;
          path.unshift({
            type: "movie",
            id: m.id,
            name: m.title,
            imageUrl: m.posterUrl,
            relationLabel: data?.relationLabel,
          });
        }
        if (!data) break;
        node = data.node;
      }
      return path;
    }

    if (current.kind === "person") {
      // Traverse all movies this person was in or directed
      const personMovies = [
        ...actedIn.filter((r) => r.personId === current.id).map((r) => ({ id: r.movieId, label: `acted in` })),
        ...directed.filter((r) => r.personId === current.id).map((r) => ({ id: r.movieId, label: `directed` })),
      ];
      for (const { id: movieId, label } of personMovies) {
        const k = `movie:${movieId}`;
        if (!visited.has(k)) {
          visited.add(k);
          const next: GraphNode = { kind: "movie", id: movieId };
          prev.set(key(next), { node: current, relationLabel: label });
          queue.push(next);
        }
      }
    } else {
      // current is a movie — traverse to all people in it
      const moviePeople = [
        ...actedIn.filter((r) => r.movieId === current.id).map((r) => ({ id: r.personId, label: "acted in" })),
        ...directed.filter((r) => r.movieId === current.id).map((r) => ({ id: r.personId, label: "directed" })),
      ];
      for (const { id: personId, label } of moviePeople) {
        const k = `person:${personId}`;
        if (!visited.has(k)) {
          visited.add(k);
          const next: GraphNode = { kind: "person", id: personId };
          prev.set(key(next), { node: current, relationLabel: label });
          queue.push(next);
        }
      }
    }
  }

  return null; // no path found
}

// ── Recommendations ──────────────────────────────────────────────────────────

/**
 * Cypher equivalent:
 *   MATCH (p:Person {id: $id})-[:ACTED_IN]->(m:Movie)<-[:ACTED_IN]-(coStar:Person)
 *   WHERE coStar.id <> p.id
 *   MATCH (coStar)-[:ACTED_IN]->(m2:Movie)<-[:ACTED_IN]-(rec:Person)
 *   WHERE rec.id <> p.id
 *     AND NOT (p)-[:ACTED_IN]->(:Movie)<-[:ACTED_IN]-(rec)
 *   RETURN rec, count(DISTINCT coStar) AS sharedConnections,
 *          collect(DISTINCT coStar.name) AS connectedVia
 *   ORDER BY sharedConnections DESC
 *   LIMIT 10
 */
export function getRecommendations(id: string): RecommendationResult[] {
  // 1. Get direct co-stars (1-hop)
  const directMovies = actedIn.filter((r) => r.personId === id).map((r) => r.movieId);
  const directCoStarIds = new Set<string>();
  for (const movieId of directMovies) {
    actedIn
      .filter((r) => r.movieId === movieId && r.personId !== id)
      .forEach((r) => directCoStarIds.add(r.personId));
  }

  // 2. For each co-star, get THEIR co-stars (2-hop)
  const recMap = new Map<string, { count: number; viaNames: Set<string> }>();

  for (const coStarId of directCoStarIds) {
    const coStarMovies = actedIn.filter((r) => r.personId === coStarId).map((r) => r.movieId);
    for (const movieId of coStarMovies) {
      const coStarPeople = actedIn.filter(
        (r) => r.movieId === movieId && r.personId !== coStarId && r.personId !== id
      );
      for (const rel of coStarPeople) {
        if (directCoStarIds.has(rel.personId)) continue; // already a direct co-star
        if (!recMap.has(rel.personId)) {
          recMap.set(rel.personId, { count: 0, viaNames: new Set() });
        }
        const entry = recMap.get(rel.personId)!;
        entry.count += 1;
        const coStarName = personById.get(coStarId)?.name ?? coStarId;
        entry.viaNames.add(coStarName);
      }
    }
  }

  return Array.from(recMap.entries())
    .map(([personId, { count, viaNames }]) => {
      const p = personById.get(personId);
      if (!p) return null;
      return {
        ...p,
        sharedConnections: count,
        connectedVia: Array.from(viaNames),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.sharedConnections - a!.sharedConnections)
    .slice(0, 10) as RecommendationResult[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getAllPeople(): Person[] {
  return people;
}

export function getAllMovies(): Movie[] {
  return movies;
}

export function getAllIndustries(): string[] {
  return [...new Set(movies.map((m) => m.industry))].sort();
}

export function getPersonById(id: string): Person | undefined {
  return personById.get(id);
}

export function getMovieById(id: string): Movie | undefined {
  return movieById.get(id);
}
