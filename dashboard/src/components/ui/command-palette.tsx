import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, ScrollText, Brain, Wrench, Lightbulb } from "lucide-react";
import { useGlobalSearch } from "@/api/hooks/use-search";
import type { SearchResult } from "@/api/types";

const typeIcons: Record<SearchResult["type"], React.ElementType> = {
  guideline: ScrollText,
  knowledge: Brain,
  tool: Wrench,
  experience: Lightbulb,
};

const typeLabels: Record<SearchResult["type"], string> = {
  guideline: "Guidelines",
  knowledge: "Knowledge",
  tool: "Tools",
  experience: "Experiences",
};

const typeRoutes: Record<SearchResult["type"], string> = {
  guideline: "/guidelines",
  knowledge: "/knowledge",
  tool: "/tools",
  experience: "/experiences",
};

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { data: results, isLoading } = useGlobalSearch(debouncedQuery, isOpen);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setDebouncedQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const groupedResults = results?.reduce(
    (acc, result) => {
      if (!acc[result.type]) acc[result.type] = [];
      if (acc[result.type].length < 5) acc[result.type].push(result);
      return acc;
    },
    {} as Record<SearchResult["type"], SearchResult[]>,
  );

  const flatResults = Object.values(groupedResults || {}).flat();

  const handleSelect = useCallback(
    (result: SearchResult) => {
      navigate(`${typeRoutes[result.type]}?highlight=${result.id}`);
      onClose();
    },
    [navigate, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && flatResults[selectedIndex]) {
        handleSelect(flatResults[selectedIndex]);
      }
    },
    [flatResults, selectedIndex, handleSelect, onClose],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="fixed left-1/2 top-[20%] w-full max-w-lg -translate-x-1/2 bg-card border border-border rounded-lg shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-border px-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search guidelines, knowledge, tools, experiences..."
            className="flex-1 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="p-1 hover:bg-muted rounded"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {!query && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Start typing to search...
              <div className="mt-2 text-xs">
                Press{" "}
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">↑</kbd>{" "}
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">↓</kbd>{" "}
                to navigate,{" "}
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">
                  Enter
                </kbd>{" "}
                to select,{" "}
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">
                  Esc
                </kbd>{" "}
                to close
              </div>
            </div>
          )}

          {query && isLoading && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Searching...
            </div>
          )}

          {query && !isLoading && flatResults.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No results found for "{query}"
            </div>
          )}

          {groupedResults &&
            Object.entries(groupedResults).map(([type, items]) => {
              const Icon = typeIcons[type as SearchResult["type"]];
              return (
                <div key={type}>
                  <div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50 sticky top-0">
                    {typeLabels[type as SearchResult["type"]]}
                  </div>
                  {items.map((result) => {
                    const globalIndex = flatResults.indexOf(result);
                    const isSelected = globalIndex === selectedIndex;
                    return (
                      <button
                        key={result.id}
                        onClick={() => handleSelect(result)}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">
                            {result.name || result.title}
                          </div>
                          {result.snippet && (
                            <div
                              className={`text-xs truncate ${
                                isSelected
                                  ? "text-primary-foreground/80"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {result.snippet}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
  };
}
