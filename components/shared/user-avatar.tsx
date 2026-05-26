import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Avatar showing colored initials (no real photos in the prototype). */
export function UserAvatar({
  name,
  color = "#0D9488",
  className,
}: {
  name: string;
  color?: string;
  className?: string;
}) {
  return (
    <Avatar className={cn("h-9 w-9", className)}>
      <AvatarFallback
        className="text-white"
        style={{ backgroundColor: color }}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
