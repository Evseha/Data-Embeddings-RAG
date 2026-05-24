import { Copy, Check } from "lucide-react";
import { RagChunk } from "@workspace/api-client-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ChunkPanelProps {
  chunks: RagChunk[];
}

export default function ChunkPanel({ chunks }: ChunkPanelProps) {
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const handleCopy = async (chunk: RagChunk) => {
    try {
      await navigator.clipboard.writeText(chunk.text);
      setCopiedId(chunk.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const getScoreColor = (score: number) => {
    if (score > 0.8) return "bg-primary/20 text-primary border-primary/30";
    if (score > 0.6) return "bg-yellow-500/20 text-yellow-500 border-yellow-500/30";
    return "bg-muted text-muted-foreground border-border";
  };

  if (chunks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-card rounded-md border border-border p-4">
        <p className="text-muted-foreground text-center">
          Ask a question to see retrieved chunks
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card rounded-md border border-border overflow-hidden">
      <div className="p-3 border-b border-border bg-muted/30">
        <h3 className="font-semibold text-sm">Retrieved Context</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chunks.map((chunk) => (
          <div key={chunk.id} className="border border-border rounded-md bg-background overflow-hidden">
            <div className="flex items-center justify-between p-2 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="font-mono text-xs text-muted-foreground truncate" title={chunk.documentName}>
                  {chunk.documentName}
                </span>
                <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                  idx: {chunk.chunkIndex}
                </Badge>
                <Badge variant="outline" className={`font-mono text-[10px] shrink-0 ${getScoreColor(chunk.similarity)}`}>
                  {(chunk.similarity * 100).toFixed(1)}%
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => handleCopy(chunk)}
                title="Copy chunk text"
              >
                {copiedId === chunk.id ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3 text-muted-foreground" />
                )}
              </Button>
            </div>
            <div className="p-3">
              <p className="font-mono text-xs whitespace-pre-wrap leading-relaxed text-foreground/90">
                {chunk.text}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
