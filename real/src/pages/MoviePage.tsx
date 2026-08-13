import { useState, useEffect, useCallback } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { ArrowLeft, AlertCircle, User, Clapperboard } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { getMovieAPI, type MovieWithCast } from "@/lib/api"

export function MoviePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [movie, setMovie] = useState<MovieWithCast | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadMovie = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const data = await getMovieAPI(id)
      setMovie(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load movie")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadMovie()
  }, [loadMovie])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-24" />
        <div className="flex gap-6">
          <Skeleton className="size-32 rounded-lg" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
        <Skeleton className="h-px w-full" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
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
        <Button variant="outline" className="mt-4" onClick={loadMovie}>Retry</Button>
      </Card>
    )
  }

  if (!movie) return null

  return (
    <div className="space-y-8">
      <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
        <ArrowLeft className="size-4" /> Back to search
      </Button>

      {/* Movie header */}
      <Card className="flex-row items-start gap-6 p-6">
        <div className="size-32 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
          <img src={movie.posterUrl} alt={movie.title} className="size-full object-cover" />
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <h1 className="scroll-m-20 text-3xl font-bold tracking-tight">{movie.title}</h1>
            <span className="text-lg text-muted-foreground">({movie.year})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="default">{movie.industry}</Badge>
            {movie.genres.map((g) => (
              <Badge key={g} variant="secondary">{g}</Badge>
            ))}
          </div>
          <p className="text-muted-foreground leading-7">{movie.overview}</p>
        </div>
      </Card>

      <Separator />

      {/* Directors */}
      {movie.directors.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Clapperboard className="size-5 text-muted-foreground" />
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight">Director{movie.directors.length > 1 ? "s" : ""}</h2>
          </div>
          <div className="flex flex-wrap gap-4">
            {movie.directors.map((d) => (
              <Link key={d.id} to={`/person/${d.id}`}>
                <Card className="flex-row items-center gap-3 p-4 hover:bg-accent/50 transition-colors">
                  <Avatar size="lg" className="size-10">
                    <AvatarImage src={d.imageUrl} alt={d.name} />
                    <AvatarFallback><User className="size-4" /></AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-sm">{d.name}</span>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Separator />

      {/* Cast */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <User className="size-5 text-muted-foreground" />
          <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight">Cast</h2>
        </div>
        {movie.cast.length === 0 ? (
          <p className="text-muted-foreground">No cast information available.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {movie.cast.map((member) => (
              <Link key={member.id} to={`/person/${member.id}`}>
                <Card className="flex-row items-center gap-3 p-4 hover:bg-accent/50 transition-colors">
                  <Avatar size="lg" className="size-12">
                    <AvatarImage src={member.imageUrl} alt={member.name} />
                    <AvatarFallback><User className="size-5" /></AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{member.name}</p>
                    <p className="text-xs text-muted-foreground truncate">as {member.role}</p>
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
