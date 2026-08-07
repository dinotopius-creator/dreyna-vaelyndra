export function RuneDivider({ label = "✦ PulseForge ✦" }: { label?: string }) {
  return (
    <div className="my-10 divider-runes">
      <span>{label}</span>
    </div>
  );
}
