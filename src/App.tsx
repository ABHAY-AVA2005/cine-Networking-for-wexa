import { BrowserRouter, Routes, Route } from "react-router-dom"
import { SearchPage } from "@/pages/SearchPage"
import { PersonPage } from "@/pages/PersonPage"
import { MoviePage } from "@/pages/MoviePage"
import { ModeToggle } from "@/components/mode-toggle"

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-svh bg-background">
        <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="text-lg">CineGraph</span>
            </a>
            <ModeToggle />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">
          <Routes>
            <Route path="/" element={<SearchPage />} />
            <Route path="/person/:id" element={<PersonPage />} />
            <Route path="/movie/:id" element={<MoviePage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
