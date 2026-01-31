import { cn } from "@/lib/utils";
import type { ConversationMessage } from "@/api/types";

interface ConversationViewProps {
  messages: ConversationMessage[];
  className?: string;
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateContent(content: string, maxLength = 500): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + "...";
}

export function ConversationView({
  messages,
  className,
}: ConversationViewProps) {
  if (messages.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No messages recorded
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            "rounded-lg p-3 text-sm",
            message.role === "user"
              ? "bg-primary/10 border border-primary/20"
              : "bg-muted/50 border border-border",
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              className={cn(
                "text-xs font-medium uppercase",
                message.role === "user"
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            >
              {message.role}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatTime(message.timestamp)}
            </span>
          </div>
          <div className="whitespace-pre-wrap break-words text-sm">
            {truncateContent(message.content)}
          </div>
        </div>
      ))}
    </div>
  );
}
