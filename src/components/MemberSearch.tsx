/**
 * PR S — Barre de recherche de membres par `@handle` ou pseudo.
 *
 * Placée en tête du fil communautaire. Debounce 250 ms pour ne pas
 * spammer l'API à chaque frappe. Clic sur un résultat → navigation
 * vers le profil du membre.
 *
 * Se ferme automatiquement au clic en dehors ou à la sélection.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import {
  apiSearchUsers,
  type UserSearchHitDto,
} from "../lib/api";
import { Handle } from "./Handle";

const DEBOUNCE_MS = 250;

export function MemberSearch() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchHitDto[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Debounce côté client avant d'appeler l'API : on n'envoie qu'après
  // 250 ms de stabilité du texte, sinon on annule la requête précédente.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      // Sync state (empty query, no request needed) via un microtask pour
      // satisfaire `react-hooks/set-state-in-effect` (pas d'update direct
      // dans le corps du useEffect).
      const id = window.setTimeout(() => {
        setResults([]);
        setLoading(false);
      }, 0);
      return () => window.clearTimeout(id);
    }
    let cancelled = false;
    const loadingTick = window.setTimeout(() => {
      if (!cancelled) setLoading(true);
    }, 0);
    const handle = window.setTimeout(() => {
      apiSearchUsers(q, 10)
        .then((hits) => {
          if (!cancelled) setResults(hits);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(loadingTick);
      window.clearTimeout(handle);
    };
  }, [query]);

  // Fermeture au clic extérieur. On ne ferme pas au clic à l'intérieur
  // pour laisser l'utilisateur consulter plusieurs résultats.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const selectHit = (hit: UserSearchHitDto) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    navigate(`/u/${encodeURIComponent(hit.id)}`);
  };

  return (
    <div ref={containerRef} className="relative">
      <label
        className="flex items-center gap-2 rounded-full border border-royal-500/30 bg-nebula-900/60 px-4 py-2 shadow-inner shadow-royal-900/40 focus-within:border-gold-400/60 focus-within:ring-1 focus-within:ring-gold-400/40"
      >
        <Search className="h-4 w-4 shrink-0 text-gold-300/70" />
        <input
          type="text"
          // 16px min pour éviter le zoom iOS Safari au focus (cf. PR #63).
          className="flex-1 bg-transparent text-base text-ivory placeholder:text-ivory/40 focus:outline-none"
          placeholder="Recherche un membre (@pseudo ou nom)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => query.trim().length >= 1 && setOpen(true)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {query && (
          <button
            type="button"
            className="shrink-0 text-ivory/40 hover:text-rose-300"
            onClick={() => {
              setQuery("");
              setResults([]);
              setOpen(false);
            }}
            aria-label="Effacer la recherche"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </label>

      {open && query.trim().length >= 1 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-royal-500/30 bg-nebula-950/95 shadow-2xl shadow-royal-900/60 backdrop-blur">
          {loading && (
            <p className="px-4 py-3 text-xs text-ivory/50">
              Recherche en cours…
            </p>
          )}
          {!loading && results.length === 0 && (
            <p className="px-4 py-3 text-xs text-ivory/50">
              Aucun membre trouvé pour « {query.trim()} ».
            </p>
          )}
          <ul className="max-h-80 divide-y divide-royal-500/10 overflow-auto">
            {results.map((hit) => (
              <li key={hit.id}>
                <Link
                  to={`/u/${encodeURIComponent(hit.id)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    selectHit(hit);
                  }}
                  className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-royal-500/10"
                >
                  <img
                    src={hit.avatarImageUrl}
                    alt={hit.username}
                    className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-royal-500/40"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-display text-gold-200">
                      {hit.username}
                    </p>
                    <Handle handle={hit.handle} size="xs" />
                  </div>
                  {hit.creature && (
                    <span
                      className="shrink-0 text-lg"
                      title={hit.creature.name}
                      aria-label={hit.creature.name}
                    >
                      {hit.creature.icon}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
