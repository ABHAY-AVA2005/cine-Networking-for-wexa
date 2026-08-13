/**
 * CineGraph API service layer.
 *
 * All functions run in-browser using the in-memory graph engine (graph.ts).
 * The function signatures and return shapes match exactly what a Next.js API
 * route would return from CognoDB, so swapping to a real backend is a
 * one-line import change per function.
 *
 * SWAP TO LIVE BACKEND:
 *   Replace each function body with: return fetch(`/api/<route>`).then(r => r.json())
 *   And implement /api/ route handlers using runQuery() from lib/db.ts.
 */

import {
  search as graphSearch,
  getPersonDetail as graphPersonDetail,
  getMovieDetail as graphMovieDetail,
  shortestPath as graphShortestPath,
  getRecommendations as graphRecommendations,
  getAllIndustries as graphGetAllIndustries,
  type Movie,
  type Person,
  type PersonWithMovies,
  type MovieWithCast,
  type PathNode,
  type RecommendationResult,
} from "@/lib/graph";

export type { Movie, Person, PersonWithMovies, MovieWithCast, PathNode, RecommendationResult };

export type SearchResult = {
  type: "person" | "movie";
  data: Person | Movie;
};

// Simulated network delay to showcase loading states (remove in production)
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function searchAPI(q: string, industryFilter?: string): Promise<SearchResult[]> {
  await delay(300);
  if (!q.trim()) return [];
  try {
    return graphSearch(q, industryFilter);
  } catch {
    throw new Error("Search failed. Please try again.");
  }
}

export function getIndustriesAPI(): string[] {
  return graphGetAllIndustries();
}

export async function getPersonAPI(id: string): Promise<PersonWithMovies> {
  await delay(400);
  const result = graphPersonDetail(id);
  if (!result) throw new Error(`Person with id "${id}" not found.`);
  return result;
}

export async function getMovieAPI(id: string): Promise<MovieWithCast> {
  await delay(400);
  const result = graphMovieDetail(id);
  if (!result) throw new Error(`Movie with id "${id}" not found.`);
  return result;
}

export async function getPathAPI(fromId: string, toId: string): Promise<PathNode[]> {
  await delay(600);
  const result = graphShortestPath(fromId, toId);
  if (!result) throw new Error("No connection found between these two people.");
  return result;
}

export async function getRecommendationsAPI(id: string): Promise<RecommendationResult[]> {
  await delay(500);
  try {
    return graphRecommendations(id);
  } catch {
    throw new Error("Failed to load recommendations.");
  }
}
