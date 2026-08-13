import { useState, useEffect, useCallback } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { ArrowLeft, AlertCircle, Users, Film, Search, User } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { getPersonAPI, getPathAPI, getRecommendationsAPI, type PersonWithMovies, type PathNode, type RecommendationResult } from "@/lib/api"
import { getAllPeople } from "@/lib/graph"
import { PathChain } from "@/components/cinegraph/PathChain"

export function PersonPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [person, setPerson] = useState<PersonWithMovies | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Path finder state
  const [pathQuery, setPathQuery] = useState("")
  const [pathResults, setPathResults] = useState<Array<{ id: string; name: string; imageUrl: string }>>([])
  const [selectedToId, setSelectedToId] = useState<string | null>(null)
  const [path, setPath] = useState<PathNode[] | null>(null)
  const [pathLoading, setPathLoading] = useState(false)
  const [pathError, setPathError] = useState<string | null>(null)

  // Recommendations state
  const [recs, setRecs] = useState<RecommendationResult[]>([])
  const [recsLoading, setRecsLoading] = useState(true)

  const loadPerson = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const data = await getPersonAPI(id)
      setPerson(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load person")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadPerson()
  }, [loadPerson])

  useEffect(() => {
    if (!id) return
    getRecommendationsAPI(id)
      .then(setRecs)
      .catch(() => setRecs([]))
      .finally(() => setRecsLoading(false))
  }, [id])

  // Filter people for path search (exclude current person)
  const allPeople = getAllPeople().filter((p) => p.id !== id)

  const handlePathSearch = (q: string) => {
    setPathQuery(q)
    if (!q.trim()) {
      setPathResults([])
      return
    }
    const lower = q.toLowerCase()
    setPathResults(
      allPeople
        .filter((p) => p.name.toLowerCase().includes(lower))
        .slice(0, 8)
        .map((p) => ({ id: p.id, name: p.name, imageUrl: p.imageUrl }))
    )
  }

  const handleFindPath = async () => {
    if (!id || !selectedToId) return
    setPathLoading(true)
    setPathError(null)
    setPath(null)
    try {
      const result = await getPathAPI(id, selectedToId)
      setPath(result)
    } catch (err) {
      setPathError(err instanceof Error ? err.message : "Failed to find path")
    } finally {
      setPathLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-24" />
        <div className="flex gap-6">
          <Skeleton className="size-24 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
        <Skeleton className="h-px w-full" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive/50 p-6">
        <div className="flex items-center gap-3 text-destructive">
          <AlertCircle className="size-5" />
          <span className="font-medium">{error}</span>
        </div>
        <Button variant="outline" className="mt-4" onClick={loadPerson}>Retry</Button>
      </Card>
    )
  }

  if (!person) return null

  return (
    <div className="space-y-8">
      <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
        <ArrowLeft className="size-4" /> Back to search
      </Button>

      {/* Profile card */}
      <Card className="flex-row items-start gap-6 p-6">
        <Avatar className="size-24 rounded-xl">
          <AvatarImage src={person.imageUrl} alt={person.name} />
          <AvatarFallback className="rounded-xl"><User className="size-8" /></AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-2">
          <h1 className="scroll-m-20 text-3xl font-bold tracking-tight">{person.name}</h1>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="capitalize">{person.role}</Badge>
            {person.industry && <Badge variant="outline">{person.industry}</Badge>}
          </div>
          <p className="text-muted-foreground leading-7">{person.bio}</p>
        </div>
      </Card>

      {/* Filmography */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Film className="size-5 text-muted-foreground" />
          <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight">Filmography</h2>
        </div>
        {person.movies.length === 0 ? (
          <p className="text-muted-foreground">No movies found.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {person.movies.map((movie) => (
              <Card key={movie.id} className="flex-row items-center gap-4 p-4 cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/movie/${movie.id}`)}>
                <div className="size-12 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  <img src={movie.posterUrl} alt={movie.title} className="size-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{movie.title}</span>
                    <span className="text-sm text-muted-foreground">({movie.year})</span>
                  </div>
                  {movie.role && <p className="text-sm text-muted-foreground truncate">as {movie.role}</p>}
                  {movie.isDirector && <p className="text-sm text-muted-foreground">Director</p>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Separator />

      {/* Co-stars */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="size-5 text-muted-foreground" />
          <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight">Co-stars</h2>
        </div>
        {person.coStars.length === 0 ? (
          <p className="text-muted-foreground">No co-stars found.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {person.coStars.map((coStar) => (
              <Link key={coStar.id} to={`/person/${coStar.id}`}>
                <Card className="items-center text-center p-4 hover:bg-accent/50 transition-colors">
                  <Avatar size="lg" className="size-16 mb-2">
                    <AvatarImage src={coStar.imageUrl} alt={coStar.name} />
                    <AvatarFallback><User className="size-6" /></AvatarFallback>
                  </Avatar>
                  <p className="font-medium text-sm truncate w-full">{coStar.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{coStar.sharedMovies.length} shared movie{coStar.sharedMovies.length !== 1 ? "s" : ""}</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <Separator />

      {/* Find connection */}
      <section className="space-y-4">
        <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight">Find Connection To...</h2>
        <p className="text-muted-foreground">Search for another person to find the shortest path between them.</p>
        <div className="flex gap-2 relative">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={pathQuery}
              onChange={(e) => handlePathSearch(e.target.value)}
              placeholder="Search for a person..."
              className="pl-10"
            />
          </div>
          <Button onClick={handleFindPath} disabled={!selectedToId || pathLoading}>
            {pathLoading ? "Finding..." : "Find Path"}
          </Button>
        </div>

        {pathResults.length > 0 && !selectedToId && (
          <div className="space-y-1 max-w-md">
            {pathResults.map((p) => (
              <Card key={p.id} className="flex-row items-center gap-3 p-3 cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => { setSelectedToId(p.id); setPathQuery(p.name); setPathResults([]) }}>
                <Avatar size="sm">
                  <AvatarImage src={p.imageUrl} alt={p.name} />
                  <AvatarFallback><User className="size-3" /></AvatarFallback>
                </Avatar>
                <span className="text-sm">{p.name}</span>
              </Card>
            ))}
          </div>
        )}

        {selectedToId && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            Target: <span className="font-medium text-foreground">{allPeople.find(p => p.id === selectedToId)?.name}</span>
            <Button variant="ghost" size="xs" onClick={() => { setSelectedToId(null); setPathQuery(""); setPath(null) }}>Change</Button>
          </div>
        )}

        {pathError && (
          <Card className="border-destructive/50 p-4">
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="size-4" />
              {pathError}
            </div>
          </Card>
        )}

        {pathLoading && (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {path && !pathLoading && <PathChain path={path} />}
      </section>

      <Separator />

      {/* Recommendations */}
      <section className="space-y-4">
        <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight">Recommended Connections</h2>
        <p className="text-muted-foreground">People you might know, based on shared co-stars.</p>
        {recsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : recs.length === 0 ? (
          <p className="text-muted-foreground">No recommendations available. Try someone with more connections.</p>
        ) : (
          <div className="space-y-2">
            {recs.map((rec, idx) => (
              <Link key={rec.id} to={`/person/${rec.id}`}>
                <Card className="flex-row items-center gap-4 p-4 hover:bg-accent/50 transition-colors">
                  <span className="text-lg font-bold text-muted-foreground w-6 text-center shrink-0">{idx + 1}</span>
                  <Avatar size="lg" className="size-12">
                    <AvatarImage src={rec.imageUrl} alt={rec.name} />
                    <AvatarFallback><User className="size-5" /></AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{rec.name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {rec.sharedConnections} shared connection{rec.sharedConnections !== 1 ? "s" : ""} via {rec.connectedVia.slice(0, 2).join(", ")}{rec.connectedVia.length > 2 ? " and others" : ""}
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
