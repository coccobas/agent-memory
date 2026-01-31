import { Download } from "lucide-react";
import { Button } from "./button";
import { exportToJSON, exportToCSV } from "@/lib/export";
import { useState } from "react";

interface ExportButtonProps<T> {
  data: T[];
  filename: string;
}

export function ExportButton<T extends Record<string, unknown>>({
  data,
  filename,
}: ExportButtonProps<T>) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        disabled={data.length === 0}
      >
        <Download className="h-4 w-4 mr-2" />
        Export
      </Button>
      {isOpen && (
        <div className="absolute right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-10 min-w-[140px]">
          <button
            onClick={() => {
              exportToJSON(data, filename);
              setIsOpen(false);
            }}
            className="block w-full px-4 py-2 text-sm text-left hover:bg-muted rounded-t-md"
          >
            Export as JSON
          </button>
          <button
            onClick={() => {
              exportToCSV(data, filename);
              setIsOpen(false);
            }}
            className="block w-full px-4 py-2 text-sm text-left hover:bg-muted rounded-b-md"
          >
            Export as CSV
          </button>
        </div>
      )}
    </div>
  );
}
