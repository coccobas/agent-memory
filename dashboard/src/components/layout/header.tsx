import { Search } from "lucide-react";
import { ScopeSelector } from "@/components/ui/scope-selector";
import { Button } from "@/components/ui/button";
import {
  CommandPalette,
  useCommandPalette,
} from "@/components/ui/command-palette";

export function Header() {
  const { isOpen, open, close } = useCommandPalette();

  return (
    <header className="flex h-16 items-center border-b border-border bg-card px-6">
      <ScopeSelector />
      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={open}>
          <Search className="h-4 w-4 mr-2" />
          Search
          <kbd className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded">⌘K</kbd>
        </Button>
      </div>
      <CommandPalette isOpen={isOpen} onClose={close} />
    </header>
  );
}
