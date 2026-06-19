import { Link } from "react-router-dom";
import { Camera, Play } from "lucide-react";
import type { CommunityPost } from "../types";

type ProfileGridProps = {
  posts: CommunityPost[];
  ownerName: string;
  onEditThumbnail?: (postId: string) => void;
  onDeletePost?: (postId: string) => void;
  canEditPosts?: boolean;
  ownEmptyLabel: string;
};

export function ProfileGrid({
  posts,
  ownerName,
  onEditThumbnail,
  onDeletePost,
  canEditPosts = false,
  ownEmptyLabel,
}: ProfileGridProps) {
  return (
    <section className="mt-12">
      <h2 className="font-display text-xl text-gold-100">Posts</h2>
      <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {posts.map((post) => {
          const likes = Object.values(post.reactions ?? {}).reduce(
            (sum, users) => sum + users.length,
            0,
          );
          const isVideo = Boolean(post.videoUrl);
          const poster = post.videoThumbnailUrl || post.imageUrl || "";
          return (
            <article
              key={post.id}
              className="group relative overflow-hidden rounded-[20px] border border-white/8 bg-night-950/70 shadow-[0_14px_40px_rgba(0,0,0,0.22)]"
            >
              <Link
                to={`/communaute#post-${post.id}`}
                className="absolute inset-0 z-10"
                aria-label={`Ouvrir le post de ${ownerName}`}
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
                    <p className="line-clamp-8 whitespace-pre-wrap text-[11px] leading-5 text-ivory/88">
                      {post.content}
                    </p>
                  </div>
                )}

                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.08),rgba(2,6,23,0.08)_35%,rgba(2,6,23,0.88)_100%)]" />

                {isVideo && (
                  <div className="absolute left-2 top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-night-950/70 text-white/85 backdrop-blur-md">
                    <Play className="h-3.5 w-3.5 fill-current" />
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 z-20 p-2.5">
                  <div className="rounded-[16px] border border-white/10 bg-night-950/72 p-2 backdrop-blur-md">
                    <p className="line-clamp-2 text-[11px] leading-4 text-ivory/88">
                      {post.content}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-ivory/55">
                      <span>{likes} likes</span>
                      <span>{post.comments.length} comm.</span>
                    </div>
                  </div>
                </div>

                {canEditPosts && (
                  <div className="absolute right-2 top-2 z-20 flex gap-1.5">
                    {onEditThumbnail && isVideo && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onEditThumbnail(post.id);
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-night-950/75 text-gold-100 backdrop-blur-md"
                        aria-label="Modifier la miniature"
                      >
                        <Camera className="h-4 w-4" />
                      </button>
                    )}
                    {onDeletePost && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onDeletePost(post.id);
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-night-950/75 text-rose-200 backdrop-blur-md"
                        aria-label="Supprimer mon post"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
        {posts.length === 0 && (
          <div className="col-span-full rounded-[20px] border border-dashed border-white/10 px-4 py-10 text-center text-sm text-ivory/50">
            {ownEmptyLabel}
          </div>
        )}
      </div>
    </section>
  );
}
