import { Link } from "react-router-dom"
import { ArrowRight, User } from "lucide-react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import type { PathNode } from "@/lib/api"

export function PathChain({ path }: { path: PathNode[] }) {
  if (path.length === 0) return null

  // A path alternates Person → Movie → Person, so the degrees of separation are
  // the number of people in the chain minus the starting person.
  const degrees = Math.max(path.filter((node) => node.type === "person").length - 1, 0)

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-semibold">Connection Path</h3>
          <span className="text-sm text-muted-foreground">{degrees} degree{degrees !== 1 ? "s" : ""} of separation</span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {path.map((node, idx) => (
            <div key={`${node.type}-${node.id}-${idx}`} className="flex items-center gap-2 shrink-0">
              {idx > 0 && (
                <div className="flex flex-col items-center gap-1 px-1">
                  <ArrowRight className="size-4 text-muted-foreground" />
                  {node.relationLabel && (
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{node.relationLabel}</span>
                  )}
                </div>
              )}
              {node.type === "person" ? (
                <Link to={`/person/${node.id}`}>
                  <div className="flex flex-col items-center gap-1 w-20 hover:bg-accent/50 rounded-lg p-2 transition-colors">
                    <Avatar size="lg" className="size-12">
                      <AvatarImage src={node.imageUrl} alt={node.name} />
                      <AvatarFallback><User className="size-5" /></AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-medium text-center truncate w-full">{node.name}</span>
                  </div>
                </Link>
              ) : (
                <div className="flex flex-col items-center gap-1 w-20">
                  <div className="size-12 rounded-md bg-muted flex items-center justify-center overflow-hidden">
                    <img src={node.imageUrl} alt={node.name} className="size-full object-cover" />
                  </div>
                  <span className="text-xs text-muted-foreground text-center truncate w-full">{node.name}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
