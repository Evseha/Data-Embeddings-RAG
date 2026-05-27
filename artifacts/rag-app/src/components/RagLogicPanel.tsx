import { Badge } from "@/components/ui/badge";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface ScoredChunk {
  id: number;
  text: string;
  similarity?: number;
  bm25Score?: number;
  chunkIndex: number;
  documentId: number;
  documentName: string;
}

interface RagLogicData {
  keywords: string[];
  embeddingChunks: ScoredChunk[];
  keywordChunks: ScoredChunk[];
  belowThreshold: boolean;
  aiAnswer?: string;
  isStreaming?: boolean;
}

interface RagLogicPanelProps {
  data: RagLogicData | null;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={handle}>
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
    </Button>
  );
}

function ChunkCard({ chunk, scoreLabel }: { chunk: ScoredChunk; scoreLabel: string }) {
  return (
    <div className="border border-border rounded bg-background overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-muted/20 gap-2">
        <span className="font-mono text-[10px] text-muted-foreground truncate flex-1" title={chunk.documentName}>
          {chunk.documentName}
        </span>
        <Badge variant="outline" className="font-mono text-[10px] shrink-0">
          #{chunk.chunkIndex}
        </Badge>
        <Badge variant="outline" className="font-mono text-[10px] shrink-0 border-primary/30 text-primary bg-primary/10">
          {scoreLabel}
        </Badge>
        <CopyButton text={chunk.text} />
      </div>
      <p className="font-mono text-[11px] whitespace-pre-wrap leading-relaxed text-foreground/85 p-2">
        {chunk.text}
      </p>
    </div>
  );
}

function Section({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="space-y-2">
      <div className={`text-[11px] font-mono font-semibold uppercase tracking-widest ${accent ?? "text-muted-foreground"}`}>
        {title}
      </div>
      {children}
    </div>
  );
}

export default function RagLogicPanel({ data }: RagLogicPanelProps) {
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center bg-card rounded-md border border-border p-4">
        <p className="text-muted-foreground text-center text-sm font-mono">
          Задайте вопрос, чтобы увидеть логику работы RAG
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card rounded-md border border-border overflow-hidden">
      <div className="p-3 border-b border-border bg-muted/30 shrink-0">
        <h3 className="font-mono font-semibold text-sm tracking-tight">Логика работы RAG</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* Keywords */}
        <Section title="1. Ключевые слова" accent="text-blue-400">
          {data.keywords.length === 0 ? (
            <p className="text-xs text-muted-foreground font-mono">Ключевые слова не найдены</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {data.keywords.map((kw) => (
                <Badge key={kw} variant="outline" className="font-mono text-xs border-blue-400/30 text-blue-400 bg-blue-400/10">
                  {kw}
                </Badge>
              ))}
            </div>
          )}
        </Section>

        {/* Embedding chunks */}
        <Section title="2. Embedding-поиск (TOP-5)" accent="text-violet-400">
          {data.embeddingChunks.length === 0 ? (
            <p className="text-xs text-muted-foreground font-mono">Нет результатов</p>
          ) : (
            <div className="space-y-2">
              {data.embeddingChunks.map((chunk) => (
                <ChunkCard
                  key={`emb-${chunk.id}`}
                  chunk={chunk}
                  scoreLabel={`sim ${((chunk.similarity ?? 0) * 100).toFixed(1)}%`}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Keyword chunks */}
        <Section title="3. BM25-поиск по ключевым словам" accent="text-amber-400">
          {data.keywordChunks.length === 0 ? (
            <p className="text-xs text-muted-foreground font-mono">Нет результатов</p>
          ) : (
            <div className="space-y-2">
              {data.keywordChunks.map((chunk) => (
                <ChunkCard
                  key={`kw-${chunk.id}`}
                  chunk={chunk}
                  scoreLabel={`bm25 ${(chunk.bm25Score ?? 0).toFixed(2)}`}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Final answer */}
        <Section title="4. Ответ AI" accent="text-green-400">
          {data.belowThreshold ? (
            <div className="border border-amber-500/30 bg-amber-500/10 rounded p-3 text-xs font-mono text-amber-400">
              Релевантность слишком низкая — ответ не сформирован
            </div>
          ) : data.aiAnswer ? (
            <div className="border border-green-500/20 bg-green-500/5 rounded p-3 text-xs font-mono text-foreground/90 whitespace-pre-wrap leading-relaxed">
              {data.aiAnswer}
              {data.isStreaming && (
                <span className="inline-block w-2 h-3 bg-green-400 ml-0.5 animate-pulse align-middle" />
              )}
            </div>
          ) : (
            <div className="border border-border rounded p-3 text-xs font-mono text-muted-foreground animate-pulse">
              Генерация ответа...
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
