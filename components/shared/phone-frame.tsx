import { BatteryFull, Signal, Wifi } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * iPhone-14-ish frame (~390 wide) used to render the mobile field-rep
 * routes inside the desktop demo (build.md §5.8).
 */
export function PhoneFrame({
  children,
  className,
  statusTime = "09:41",
}: {
  children: React.ReactNode;
  className?: string;
  statusTime?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[390px] shrink-0", className)}>
      <div className="relative rounded-[3rem] border border-slate-700 bg-slate-900 p-3 shadow-2xl">
        {/* Dynamic island */}
        <div className="absolute left-1/2 top-[18px] z-20 h-[26px] w-[110px] -translate-x-1/2 rounded-full bg-black" />
        <div className="relative h-[760px] overflow-hidden rounded-[2.25rem] bg-background">
          {/* Status bar */}
          <div className="flex items-center justify-between bg-card px-7 pb-1 pt-3 text-xs font-semibold text-foreground">
            <span className="tnum">{statusTime}</span>
            <div className="flex items-center gap-1.5">
              <Signal className="h-3.5 w-3.5" />
              <Wifi className="h-3.5 w-3.5" />
              <BatteryFull className="h-4 w-4" />
            </div>
          </div>
          {/* Scrollable screen */}
          <div className="scrollbar-thin h-[calc(760px-30px)] overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
