import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Search, AlertCircle, Film, User } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { searchAPI, type SearchResult } from "@/lib/api"

const INDUSTRIES = ["all", "Hollywood", "Bollywood", "Tollywood", "Kollywood", "Mollywood"]

export function SearchPage() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [industry, setIndustry] = useState("all")
  const navigate = useNavigate()

  const doSearch = useCallback(async (q: string, ind: string) => {
    if (!q.trim()) {
      setResults([])
      setSearched(false)
      return
    }
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      const data = await searchAPI(q, ind)
      setResults(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed")
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => doSearch(query, industry), 250)
    return () => clearTimeout(t)
  }, [query, industry, doSearch])

  return (
    <div className="space-y-8">
      <div className="space-y-4 text-center pt-8">
        <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight text-balance">
          Explore the Movie Talent Network
        </h1>
        <p className="text-xl text-muted-foreground mx-auto max-w-2xl">
          Search across Hollywood, Bollywood, Tollywood, Kollywood, and Mollywood. Discover connections and find the shortest path between any two people.
        </p>
      </div>

      <div className="relative mx-auto max-w-2xl">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a person or movie..."
          className="h-12 pl-10 text-base"
          autoFocus
        />
      </div>

      {/* Industry filter */}
      <div className="mx-auto max-w-2xl flex flex-wrap justify-center gap-2">
        {INDUSTRIES.map((ind) => (
          <button
            key={ind}
            onClick={() => setIndustry(ind)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors capitalize ${
              industry === ind
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {ind === "all" ? "All Industries" : ind}
          </button>
        ))}
      </div>

      {loading && (
        <div className="mx-auto max-w-2xl space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-lg border border-border p-4">
              <Skeleton className="size-12 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && !loading && (
        <Card className="mx-auto max-w-2xl border-destructive/50 p-6">
          <div className="flex items-center gap-3 text-destructive">
            <AlertCircle className="size-5" />
            <span className="font-medium">{error}</span>
          </div>
          <Button variant="outline" className="mt-4" onClick={() => doSearch(query, industry)}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !error && searched && results.length === 0 && (
        <div className="mx-auto max-w-2xl text-center py-12">
          <p className="text-muted-foreground text-lg">No matches found.</p>
          <p className="text-muted-foreground text-sm mt-1">Try a different name, movie title, or industry filter.</p>
        </div>
      )}

      {!loading && !error && results.length > 0 && (
        <div className="mx-auto max-w-2xl space-y-2">
          {results.map((result) => (
            <SearchResultCard key={`${result.type}-${(result.data as { id: string }).id}`} result={result} onClick={() => navigate(`/${result.type}/${(result.data as { id: string }).id}`)} />
          ))}
        </div>
      )}

      {!loading && !error && !searched && (
        <div className="mx-auto max-w-2xl space-y-4">
          <h2 className="text-lg font-semibold text-muted-foreground text-center">Try searching for</h2>
          <div className="flex flex-wrap justify-center gap-2">
            {["Nolan", "Baahubali", "Rajinikanth", "Mohanlal", "SRK", "Matrix"].map((term) => (
              <Badge key={term} variant="secondary" className="cursor-pointer text-sm py-1.5" onClick={() => setQuery(term)}>
                {term}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SearchResultCard({ result, onClick }: { result: SearchResult; onClick: () => void }) {
  const isPerson = result.type === "person"
  const data = result.data as { id: string; name?: string; title?: string; imageUrl?: string; bio?: string; year?: number; posterUrl?: string; overview?: string; industry?: string }

  return (
    <Card
      className="flex-row items-center gap-4 p-4 py-4 cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={onClick}
    >
      {isPerson ? (
        <Avatar size="lg" className="size-12">
          <AvatarImage src={data.imageUrl} alt={data.name} />
          <AvatarFallback><User className="size-5" /></AvatarFallback>
        </Avatar>
      ) : (
        <div className="size-12 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
          {data.posterUrl ? (
            <img src={data.posterUrl} alt={data.title} className="size-full object-cover" />
          ) : (
            <Film className="size-5 text-muted-foreground" />
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{isPerson ? data.name : data.title}</span>
          {!isPerson && data.year && <span className="text-sm text-muted-foreground">({data.year})</span>}
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {isPerson ? data.bio : data.overview}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <Badge variant="outline" className="capitalize">{result.type}</Badge>
        {data.industry && <span className="text-xs text-muted-foreground">{data.industry}</span>}
      </div>
    </Card>
  )
}
