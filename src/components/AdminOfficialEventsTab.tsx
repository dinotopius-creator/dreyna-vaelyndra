import { useState } from "react";
import { Megaphone } from "lucide-react";
import { useToast } from "../contexts/ToastContext";
import { adminCreateOfficialEvent } from "../lib/adminApi";

export function AdminOfficialEventsTab() {
  const { notify } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const event = await adminCreateOfficialEvent({
        title: title.trim(),
        description: description.trim(),
        eventDate: eventDate.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
      });
      setTitle("");
      setDescription("");
      setEventDate("");
      setImageUrl("");
      notify(`Annonce officielle publiée (#${event.id}).`, "success");
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Impossible de publier l'annonce.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card-royal max-w-3xl space-y-4 p-6">
      <div>
        <h2 className="flex items-center gap-2 font-display text-2xl text-gold-200">
          <Megaphone className="h-5 w-5 text-gold-300" />
          Annonce officielle
        </h2>
        <p className="mt-1 text-sm text-ivory/60">
          Publie un événement Vaelyndra mis en avant dans le fil communauté.
          Les membres normaux ne peuvent pas créer ce type de publication.
        </p>
      </div>

      <input
        className="glass-input w-full"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titre de l'événement"
        maxLength={120}
        required
      />
      <textarea
        className="glass-input w-full resize-none"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description claire de l'événement"
        rows={6}
        maxLength={1800}
        required
      />
      <div className="grid gap-3 md:grid-cols-2">
        <input
          className="glass-input w-full"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          placeholder="Date ou période (optionnel)"
          maxLength={80}
        />
        <input
          className="glass-input w-full"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="URL d'image directe (optionnel)"
          maxLength={1024}
        />
      </div>
      <button className="btn-gold" disabled={saving}>
        {saving ? "Publication..." : "Publier l'annonce officielle"}
      </button>
    </form>
  );
}
