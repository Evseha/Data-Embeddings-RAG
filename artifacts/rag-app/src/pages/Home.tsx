import { useState } from "react";
import { useGetRagStats, useListDocuments } from "@workspace/api-client-react";
import ChatPanel from "@/components/ChatPanel";
import RagLogicPanel from "@/components/RagLogicPanel";
import UploadPanel from "@/components/UploadPanel";
import DocumentList from "@/components/DocumentList";
import { Server, Database } from "lucide-react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

const NOT_FOUND_MSG = "К сожалению, я не нашёл информацию по этому вопросу в базе знаний.";

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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function Home() {
  const { data: stats } = useGetRagStats({ query: { refetchInterval: 5000 } });
  const { data: documents } = useListDocuments();
  const hasDocuments = !!(documents && documents.length > 0);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ragLogic, setRagLogic] = useState<RagLogicData | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendMessage = async (question: string) => {
    setError(null);
    setIsStreaming(true);
    setMessages((prev) => [...prev, { role: "user", content: question }]);

    try {
      // Step 1: Hybrid retrieve
      const retrieveRes = await fetch("/api/rag/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!retrieveRes.ok) throw new Error("Ошибка поиска по базе знаний");

      const rd = await retrieveRes.json() as {
        keywords: string[];
        embeddingChunks: ScoredChunk[];
        keywordChunks: ScoredChunk[];
        mergedChunks: ScoredChunk[];
        belowThreshold: boolean;
      };

      // Show RAG logic with keywords and chunks; answer pending
      setRagLogic({
        keywords: rd.keywords,
        embeddingChunks: rd.embeddingChunks,
        keywordChunks: rd.keywordChunks,
        belowThreshold: rd.belowThreshold,
        aiAnswer: undefined,
        isStreaming: !rd.belowThreshold,
      });

      // Step 2: Hallucination guard — skip LLM if below threshold
      if (rd.belowThreshold) {
        setMessages((prev) => [...prev, { role: "assistant", content: NOT_FOUND_MSG }]);
        setRagLogic((prev) => prev ? { ...prev, aiAnswer: NOT_FOUND_MSG, isStreaming: false } : prev);
        return;
      }

      // Add empty assistant message slot
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      // Step 3: Stream AI response
      const chatRes = await fetch("/api/rag/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, chunks: rd.mergedChunks }),
      });

      if (!chatRes.ok || !chatRes.body) throw new Error("Ошибка соединения с AI");

      const reader = chatRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamed = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              streamed += data.content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: streamed };
                return updated;
              });
              setRagLogic((prev) => prev ? { ...prev, aiAnswer: streamed, isStreaming: true } : prev);
            } else if (data.done) {
              setRagLogic((prev) => prev ? { ...prev, isStreaming: false } : prev);
            } else if (data.error) {
              throw new Error(`AI: ${data.error}`);
            }
          } catch (e: any) {
            if (e.message?.startsWith("AI:")) throw e;
          }
        }
      }

      setRagLogic((prev) => prev ? { ...prev, isStreaming: false } : prev);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Произошла ошибка");
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && !last.content) {
          return [...prev.slice(0, -1), { role: "assistant", content: "Ошибка: не удалось получить ответ." }];
        }
        return [...prev, { role: "assistant", content: "Ошибка: не удалось получить ответ." }];
      });
      setRagLogic((prev) => prev ? { ...prev, isStreaming: false } : prev);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <header className="flex-none border-b border-border bg-card px-6 py-4 flex items-start gap-8">
        <div className="flex flex-col min-w-[180px]">
          <h1 className="text-xl font-bold font-mono tracking-tight text-primary flex items-center gap-2">
            <Server className="h-5 w-5" />
            RAG_TERMINAL
          </h1>
          <div className="mt-4 flex flex-col gap-2 text-xs font-mono text-muted-foreground">
            <div className="flex items-center gap-2">
              <Database className="h-3 w-3" />
              <span>{stats?.documentCount || 0} docs</span>
              <span className="text-border">|</span>
              <span>{stats?.chunkCount || 0} chunks</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                {stats?.isModelReady ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500" />
                )}
              </span>
              <span>{stats?.isModelReady ? "Model Ready" : "Loading model..."}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 flex gap-6">
          <div className="flex-1">
            <h2 className="text-sm font-semibold mb-2 text-foreground/80">Upload source (.txt)</h2>
            <UploadPanel />
          </div>
          <div className="flex-1 min-w-[300px]">
            <h2 className="text-sm font-semibold mb-2 text-foreground/80">Indexed Documents</h2>
            <DocumentList />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-hidden p-4">
        {error && (
          <div className="mb-3 p-3 bg-destructive/10 border border-destructive/30 rounded text-destructive text-sm font-mono">
            {error}
          </div>
        )}
        <ResizablePanelGroup direction="horizontal" className="h-full border border-border rounded-lg overflow-hidden">
          <ResizablePanel defaultSize={40} minSize={25}>
            <ChatPanel
              onSendMessage={handleSendMessage}
              messages={messages}
              isStreaming={isStreaming}
              hasDocuments={hasDocuments}
            />
          </ResizablePanel>
          <ResizableHandle withHandle className="bg-border" />
          <ResizablePanel defaultSize={60} minSize={35}>
            <RagLogicPanel data={ragLogic} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  );
}
