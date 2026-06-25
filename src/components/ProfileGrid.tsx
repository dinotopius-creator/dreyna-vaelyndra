import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, MoreVertical, Play, X } from "lucide-react";
import type { CommunityPost } from "../types";

type ProfileGridProps = {
  posts: CommunityPost[];
  ownerName: string;
  onEditThumbnail?: (postId: string) => void;
  onDeletePost?: (postId: string) => void;
  canEditPosts?: boolean;
  ownEmptyLabel: string;
};

function hasVisibleMedia(post: CommunityPost) {
  return Boolean(post.videoUrl || post.imageUrl || post.videoThumbnailUrl);
}

export function ProfileGrid({
  posts,
  ownerName,
  onEditThumbnail,
  onDeletePost,
  canEditPosts = false,
  ownEmptyLabel,
}: ProfileGridProps) {
  const visiblePosts = useMemo(() => posts.filter(hasVisibleMedia), [posts]);
  const [focusedPostId, setFocusedPostId] = useState<string | null>(null);
  const [menuPostId, setMenuPostId] = useState<string | null>(null);
  const focusedPost = visiblePosts.find((post) => post.id === focusedPostId) ?? null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFocusedPostId(null);
        setMenuPostId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <section className="mt-12">
      <h2 className="font-display text-xl text-gold-100">Posts</h2>
      <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {visiblePosts.map((post) => {
          const isVideo = Boolean(post.videoUrl);
          const poster = post.videoThumbnailUrl || post.imageUrl || "";
          const isActive = focusedPostId === post.id;
          const menuOpen = menuPostId === post.id;
          const canOpenMenu = canEditPosts && Boolean(onEditThumbnail);

          return (
            <article
              key={post.id}
              className={`group relative overflow-hidden rounded-[20px] border bg-night-950/70 shadow-[0_14px_40px_rgba(0,0,0,0.22)] transition duration-200 ${
                isActive ? "border-gold-300/50 ring-2 ring-gold-300/25" : "border-white/8"
              }`}
            >
              <button
                type="button"
                onClick={() =>
                  setFocusedPostId((current) => (current === post.id ? null : post.id))
                }
                className="absolute inset-0 z-10"
                aria-label={`Agrandir le post de ${ownerName}`}
              />

              <div className="relative aspect-[4/5] overflow-hidden">
                {poster ? (
                  <img
                    src={poster}
                    alt={post.content}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                ) : isVideo ? (
                  <video
                    src={post.videoUrl}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                    loop
                    autoPlay
                    preload="metadata"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.16),transparent_35%),linear-gradient(180deg,#18111f,#09060d)] px-3 text-center">
                    <p className="line-clamp-6 whitespace-pre-wrap text-[12px] leading-5 text-ivory/82">
                      {post.content}
                    </p>
                  </div>
                )}

                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.02),rgba(2,6,23,0.18)_66%,rgba(2,6,23,0.32)_100%)]" />

                {isVideo && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-night-950/55 text-white/92 shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-md">
                      <Play className="h-5 w-5 fill-current" />
                    </div>
                  </div>
                )}

                <div className="absolute left-2 top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-night-950/55 text-white/95 backdrop-blur-md">
                  {isVideo ? <Play className="h-3.5 w-3.5 fill-current" /> : <Camera className="h-3.5 w-3.5" />}
                </div>

                {canOpenMenu && (
                  <div className="absolute right-2 top-2 z-20">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setMenuPostId((current) => (current === post.id ? null : post.id));
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-night-950/60 text-white/95 shadow-[0_10px_24px_rgba(0,0,0,0.24)] backdrop-blur-md transition hover:border-gold-300/45 hover:bg-night-950/80 hover:text-gold-50"
                      aria-label="Options du post"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>

                    {menuOpen && (
                      <>
                        <button
                          type="button"
                          className="fixed inset-0 z-30 cursor-default bg-transparent"
                          aria-label="Fermer le menu"
                          onClick={() => setMenuPostId(null)}
                        />
                        <div className="absolute right-0 top-10 z-40 w-44 overflow-hidden rounded-2xl border border-white/10 bg-night-950/95 p-1 shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-md">
                          {onEditThumbnail && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setMenuPostId(null);
                                onEditThumbnail(post.id);
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-ivory/85 transition hover:bg-gold-500/15 hover:text-gold-100"
                            >
                              <Camera className="h-4 w-4" />
                              Modifier la miniature
                            </button>
                          )}
                          {onDeletePost && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setMenuPostId(null);
                                onDeletePost(post.id);
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-rose-100 transition hover:bg-rose-500/15 hover:text-rose-50"
                            >
                              <X className="h-4 w-4" />
                              Supprimer le post
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}

        {visiblePosts.length === 0 && (
          <div className="col-span-full rounded-[20px] border border-dashed border-white/10 px-4 py-10 text-center text-sm text-ivory/50">
            {ownEmptyLabel}
          </div>
        )}
      </div>

      {focusedPost && (
        <div
          className="fixed inset-0 z-[260] bg-night-950/88 backdrop-blur-md"
          onClick={() => setFocusedPostId(null)}
          role="presentation"
        >
          <div className="flex h-full w-full items-center justify-center p-4">
            <div
              className="relative w-full max-w-[min(92vw,560px)] overflow-hidden rounded-[28px] border border-gold-300/25 bg-night-950 shadow-[0_30px_90px_rgba(0,0,0,0.58)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                <div>
                  <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                    Aperçu
                  </p>
                  <p className="text-sm text-ivory/72">{ownerName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/communaute/post/${focusedPost.id}`}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-gold-300/35 bg-gold-500/15 px-3 py-2 text-xs font-semibold text-gold-100 transition hover:bg-gold-500/25"
                  >
                    Ouvrir le post
                  </Link>
                  <button
                    type="button"
                    onClick={() => setFocusedPostId(null)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ivory/80"
                    aria-label="Fermer l'aperçu"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="relative aspect-[4/5] bg-night-950">
                {focusedPost.videoUrl ? (
                  <video
                    src={focusedPost.videoUrl}
                    className="h-full w-full object-cover"
                    controls
                    autoPlay
                    playsInline
                    poster={focusedPost.videoThumbnailUrl || focusedPost.imageUrl || undefined}
                  />
                ) : (
                  <img
                    src={focusedPost.imageUrl || focusedPost.videoThumbnailUrl || ""}
                    alt={focusedPost.content}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
