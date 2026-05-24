import { useState } from "react";
import { useGetRagStats, useListDocuments } from "@workspace/api-client-react";
import { RagChunk } from "@workspace/api-client-react";
import ChatPanel from "@/components/ChatPanel";
import ChunkPanel from "@/components/ChunkPanel";
import UploadPanel from "@/components/UploadPanel";
import DocumentList from "@/components/DocumentList";
import { Server, Database } from "lucide-react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  chunks?: RagChunk[];
}

export default function Home() {
  const { data: stats } = useGetRagStats({
    query: { refetchInterval: 5000 }
  });
  
  const { data: documents } = useListDocuments();
  const hasDocuments = documents && documents.length > 0;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chunks, setChunks] = useState<RagChunk[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendMessage = async (question: string) => {
    setError(null);
    setIsStreaming(true);
    
    const newMessages = [...messages, { role: "user", content: question } as ChatMessage];
    setMessages(newMessages);

    try {
      // Step 1: Retrieve chunks
      const retrieveRes = await fetch("/api/rag/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });

      if (!retrieveRes.ok) {
        throw new Error("Failed to retrieve chunks");
      }

      const retrieveData = await retrieveRes.json();
      const retrievedChunks = retrieveData.chunks || [];
      setChunks(retrievedChunks);

      // Add empty assistant message
      setMessages((prev) => [...prev, { role: "assistant", content: "", chunks: retrievedChunks }]);

      // Step 2: Stream chat
      const chatRes = await fetch("/api/rag/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, chunks: retrievedChunks })
      });

      if (!chatRes.ok || !chatRes.body) {
        throw new Error("Failed to stream chat");
      }

      const reader = chatRes.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let streamedContent = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        
        if (value) {
          const chunkStr = decoder.decode(value, { stream: true });
          const lines = chunkStr.split("\n");
          
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.substring(6));
                if (data.content) {
                  streamedContent += data.content;
                  setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1].content = streamedContent;
                    return updated;
                  });
                }
              } catch (e) {
                // Ignore parse errors on partial chunks
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred");
      setMessages((prev) => [...prev, { role: "assistant", content: "Error: Could not complete the request." }]);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <header className="flex-none border-b border-border bg-card px-6 py-4 flex items-start gap-8">
        <div className="flex flex-col min-w-[200px]">
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
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
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

      {/* Main Workspace */}
      <main className="flex-1 overflow-hidden p-4">
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md text-destructive text-sm font-mono">
            {error}
          </div>
        )}
        
        <ResizablePanelGroup direction="horizontal" className="h-full border border-border rounded-lg overflow-hidden">
          <ResizablePanel defaultSize={50} minSize={30}>
            <ChatPanel 
              onSendMessage={handleSendMessage} 
              messages={messages} 
              isStreaming={isStreaming} 
              hasDocuments={!!hasDocuments} 
            />
          </ResizablePanel>
          
          <ResizableHandle withHandle className="bg-border" />
          
          <ResizablePanel defaultSize={50} minSize={30}>
            <ChunkPanel chunks={chunks} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  );
}
