import { channelMeta } from "@/lib/utils/channel-config";
import { cn } from "@/lib/utils";

interface ChannelDotProps {
  channel: string;
  size?: number;
  className?: string;
  withLabel?: boolean;
}

/**
 * The 8px channel-color dot — the visual through-line of the whole app
 * (build.md §3.3). Every WA / email / IG / Tokopedia reference gets one.
 */
export function ChannelDot({
  channel,
  size = 8,
  className,
  withLabel = false,
}: ChannelDotProps) {
  const meta = channelMeta(channel);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        aria-hidden
        className="inline-block shrink-0 rounded-full"
        style={{ width: size, height: size, backgroundColor: meta.color }}
      />
      {withLabel && (
        <span className="text-xs text-muted-foreground">{meta.label}</span>
      )}
    </span>
  );
}
