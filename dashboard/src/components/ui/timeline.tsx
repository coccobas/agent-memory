import { cn } from "@/lib/utils";

export type TimelineEventType =
  | "started"
  | "checkpoint"
  | "decision"
  | "error"
  | "completed"
  | "episode_start"
  | "episode_end"
  | "event";

interface TimelineItem {
  id: string;
  timestamp: string;
  type: TimelineEventType;
  name: string;
  description?: string;
}

interface TimelineProps {
  items: TimelineItem[];
  className?: string;
}

const dotColors: Record<TimelineEventType, string> = {
  started: "bg-green-500",
  completed: "bg-green-500",
  episode_start: "bg-green-500",
  episode_end: "bg-gray-400",
  checkpoint: "bg-blue-500",
  decision: "bg-yellow-500",
  error: "bg-red-500",
  event: "bg-blue-400",
};

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function Timeline({ items, className }: TimelineProps) {
  if (items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No events to display
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const dotColor = dotColors[item.type] || "bg-gray-400";

        return (
          <div key={item.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div
                className={cn("w-3 h-3 rounded-full shrink-0 mt-1.5", dotColor)}
              />
              {!isLast && (
                <div className="w-px h-full bg-border min-h-[2rem]" />
              )}
            </div>

            <div className="pb-6 flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground font-mono">
                  {formatDate(item.timestamp)} {formatTime(item.timestamp)}
                </span>
                <span className="text-xs text-muted-foreground/60 uppercase">
                  {item.type.replace("_", " ")}
                </span>
              </div>
              <p className="text-sm font-medium mt-0.5 break-words">
                {item.name}
              </p>
              {item.description && (
                <p className="text-xs text-muted-foreground mt-1 break-words">
                  {item.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
