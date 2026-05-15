import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MessageCircle, Inbox } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useMessages } from "../contexts/MessagesContext";
import { SectionHeading } from "../components/SectionHeading";
import { formatRelative } from "../lib/helpers";

export function Messages() {
  const { user } = useAuth();
  const { conversations, refreshConversations } = useMessages();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate("/connexion", { replace: true });
      return;
    }
    refreshConversations();
  }, [user, navigate, refreshConversations]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-5">
      <SectionHeading
        eyebrow="Messagerie"
        title="Mes conversations"
        subtitle="Discussions privées avec les autres membres de Vaelyndra."
      />

      {conversations.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-10 rounded-2xl border border-royal-500/20 bg-night-800/40 p-10 text-center"
        >
          <Inbox className="mx-auto h-10 w-10 text-gold-300/80" />
          <p className="mt-4 text-sm text-ivory/70">
            Aucune conversation pour l'instant. Visite le profil d'un membre et
            clique sur <strong className="text-gold-200">Envoyer un message</strong> pour
            commencer.
          </p>
          <Link
            to="/communaute"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-gold-400/50 bg-gold-500/10 px-4 py-2 text-xs font-semibold text-gold-200 hover:bg-gold-500/20"
          >
            <MessageCircle className="h-4 w-4" /> Voir les membres
          </Link>
        </motion.div>
      ) : (
        <ul className="mt-8 divide-y divide-royal-500/10 rounded-2xl border border-royal-500/20 bg-night-800/40">
          {conversations.map((c) => (
            <li key={c.other_user_id}>
              <Link
                to={`/messages/${encodeURIComponent(c.other_user_id)}`}
                className="flex items-start gap-3 px-4 py-4 transition hover:bg-night-700/40 sm:items-center sm:gap-4 sm:px-5"
              >
                <img
                  src={c.other_avatar || "/favicon.svg"}
                  alt={c.other_username}
                  className="h-12 w-12 flex-none rounded-full border border-gold-400/30 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                    <p className="truncate font-regal text-sm font-semibold text-ivory">
                      {c.other_username}
                    </p>
                    <span className="flex-none text-[10px] uppercase tracking-[0.18em] text-ivory/50">
                      {formatRelative(c.last_message.created_at)}
                    </span>
                  </div>
                  <p
                    className={`mt-1 truncate text-xs ${
                      c.unread_count > 0 && c.last_message.sender_id !== user.id
                        ? "font-semibold text-gold-200"
                        : "text-ivory/60"
                    }`}
                  >
                    {c.last_message.sender_id === user.id ? "Moi : " : ""}
                    {c.last_message.content}
                  </p>
                </div>
                {c.unread_count > 0 && (
                  <span className="flex-none rounded-full bg-gold-shine px-2 py-0.5 text-[10px] font-bold text-night-900">
                    {c.unread_count}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
