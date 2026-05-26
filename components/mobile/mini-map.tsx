import { cn } from "@/lib/utils";

/** Lightweight stylized map snippet (SVG) for the phone screens. */
export function MiniMap({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border", className)}>
      <svg viewBox="0 0 320 160" className="h-full w-full" role="img" aria-label="Peta rute">
        <rect width="320" height="160" fill="#E8EEF3" />
        {/* roads */}
        <g stroke="#CBD5E1" strokeWidth="6" strokeLinecap="round">
          <line x1="-10" y1="40" x2="330" y2="55" />
          <line x1="60" y1="-10" x2="90" y2="170" />
          <line x1="200" y1="-10" x2="240" y2="170" />
          <line x1="-10" y1="120" x2="330" y2="110" />
        </g>
        {/* route */}
        <polyline
          points="40,130 90,120 150,80 220,90 280,40"
          fill="none"
          stroke="#0D9488"
          strokeWidth="3"
          strokeDasharray="6 6"
        />
        {/* stops */}
        {[
          [90, 120],
          [150, 80],
          [220, 90],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="4" fill="#fff" stroke="#0D9488" strokeWidth="2" />
        ))}
        {/* current location */}
        <circle cx="40" cy="130" r="9" fill="#0D9488" opacity="0.18" />
        <circle cx="40" cy="130" r="5" fill="#0D9488" stroke="#fff" strokeWidth="2" />
        {/* destination */}
        <circle cx="280" cy="40" r="6" fill="#EF4444" stroke="#fff" strokeWidth="2" />
      </svg>
    </div>
  );
}
