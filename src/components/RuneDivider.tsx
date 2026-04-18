export function RuneDivider({ label = "✦ Vaelyndra ✦" }: { label?: string }) {
  return (
    <div className="my-10 divider-runes">
      <span>{label}</span>
    </div>
  );
}
