import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock, Search } from "lucide-react";
import type { AgentConversationMeta } from "../../lib/agent-conversation";
import { cn } from "../../lib/utils";

interface ConversationHistoryMenuProps {
  open: boolean;
  conversations: AgentConversationMeta[];
  activeConversationId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
}

type DateGroup = "Today" | "Yesterday" | "Older";

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDateGroup(updatedAt: string): DateGroup {
  const updated = startOfDay(new Date(updatedAt));
  const today = startOfDay(new Date());
  const diffDays = Math.floor(
    (today.getTime() - updated.getTime()) / 86_400_000,
  );
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return "Older";
}

function groupConversations(
  conversations: AgentConversationMeta[],
  query: string,
): { label: DateGroup; items: AgentConversationMeta[] }[] {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? conversations.filter((conversation) =>
        conversation.title.toLowerCase().includes(normalizedQuery),
      )
    : conversations;

  const groups: Record<DateGroup, AgentConversationMeta[]> = {
    Today: [],
    Yesterday: [],
    Older: [],
  };

  for (const conversation of filtered) {
    groups[getDateGroup(conversation.updatedAt)].push(conversation);
  }

  return (["Today", "Yesterday", "Older"] as const)
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, items: groups[label] }));
}

export function ConversationHistoryMenu({
  open,
  conversations,
  activeConversationId,
  onClose,
  onSelect,
}: ConversationHistoryMenuProps) {
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const grouped = useMemo(
    () => groupConversations(conversations, query),
    [conversations, query],
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      className="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-lg border border-border-subtle bg-bg-panel shadow-xl"
    >
      <div className="border-b border-border-subtle p-2">
        <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-viewer px-2 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations…"
            className="w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-text-disabled"
          />
        </div>
      </div>

      <div className="max-h-[320px] overflow-y-auto py-1">
        {grouped.length === 0 && (
          <p className="px-3 py-6 text-center text-[12px] text-text-secondary">
            No conversations found
          </p>
        )}

        {grouped.map((group) => (
          <div key={group.label}>
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-text-secondary">
              {group.label}
            </div>
            {group.items.map((conversation) => {
              const active = conversation.id === activeConversationId;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => {
                    onSelect(conversation.id);
                    onClose();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
                    active
                      ? "bg-resolve-accent/15 text-foreground"
                      : "text-foreground hover:bg-bg-raised",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                      active
                        ? "border-resolve-accent bg-resolve-accent text-bg-app"
                        : "border-border-subtle text-transparent",
                    )}
                  >
                    <Check className="h-2.5 w-2.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px]">
                    {conversation.title}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {conversations.length > 0 && (
        <div className="border-t border-border-subtle px-3 py-2 text-[10px] text-text-secondary">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            <span>{conversations.length} saved conversations</span>
          </div>
        </div>
      )}
    </div>
  );
}
