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
    <header className="flex h-16 items-center border-b border-white/5 glass px-6 z-10 sticky top-0">
      <ScopeSelector />
      <div className="ml-auto flex items-center gap-4">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={open}
          className="bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 transition-all group"
        >
          <Search className="h-4 w-4 mr-2 text-muted-foreground group-hover:text-white transition-colors" />
          <span className="text-muted-foreground group-hover:text-white transition-colors">Search</span>
          <kbd className="ml-2 text-[10px] bg-white/10 px-1.5 py-0.5 rounded border border-white/10 text-muted-foreground">⌘K</kbd>
        </Button>
      </div>
      <CommandPalette isOpen={isOpen} onClose={close} />
    </header>
  );
}
