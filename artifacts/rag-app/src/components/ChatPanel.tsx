import { useState, useRef, useEffect } from "react";
import { Send, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RagChunk } from "@workspace/api-client-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  chunks?: RagChunk[];
}

interface ChatPanelProps {
  onSendMessage: (message: string) => Promise<void>;
  messages: ChatMessage[];
  isStreaming: boolean;
  hasDocuments: boolean;
}

export default function ChatPanel({
  onSendMessage,
  messages,
  isStreaming,
  hasDocuments,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const dialogBodyRef = useRef<HTMLDivElement>(null);

  const userMessages = messages.filter((m) => m.role === "user");
  const assistantMessages = messages.filter((m) => m.role === "assistant");

  useEffect(() => {
    if (isStreaming) {
      setDialogOpen(true);
      setActiveIdx(assistantMessages.length - 1);
    }
  }, [isStreaming, assistantMessages.length]);

  useEffect(() => {
    if (dialogBodyRef.current) {
      dialogBodyRef.current.scrollTop = dialogBodyRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  const handleSend = () => {
    if (!input.trim() || !hasDocuments || isStreaming) return;
    onSendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const openAnswer = (idx: number) => {
    setActiveIdx(idx);
    setDialogOpen(true);
  };

  const activeAnswer = activeIdx !== null ? assistantMessages[activeIdx] : null;
  const activeQuestion = activeIdx !== null ? userMessages[activeIdx] : null;
  const isActiveStreaming =
    isStreaming && activeIdx === assistantMessages.length - 1;

  return (
    <>
      <div className="flex flex-col h-full bg-card rounded-md border border-border overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {userMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm">
              <p>
                {hasDocuments
                  ? "Ask a question about your documents."
                  : "Upload a document to get started."}
              </p>
            </div>
          ) : (
            userMessages.map((msg, idx) => {
              const answer = assistantMessages[idx];
              const pending = isStreaming && idx === userMessages.length - 1 && !answer?.content;
              return (
                <div
                  key={idx}
                  className="flex items-start gap-3 rounded-md px-3 py-2 hover:bg-muted/40 group cursor-pointer transition-colors"
                  onClick={() => answer && openAnswer(idx)}
                >
                  <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate font-mono">{msg.content}</p>
                    {pending ? (
                      <p className="text-xs text-muted-foreground mt-0.5 animate-pulse">
                        Generating answer...
                      </p>
                    ) : answer ? (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {answer.content.slice(0, 80)}
                        {answer.content.length > 80 ? "..." : ""}
                      </p>
                    ) : null}
                  </div>
                  {answer && (
                    <span className="text-xs text-primary opacity-0 group-hover:opacity-100 shrink-0 transition-opacity">
                      View
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 bg-card border-t border-border">
          <div className="relative">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                hasDocuments
                  ? "Type a question... (Enter to send)"
                  : "Waiting for documents..."
              }
              className="min-h-[60px] pr-12 resize-none bg-background focus-visible:ring-1 focus-visible:ring-primary font-mono text-sm"
              disabled={!hasDocuments || isStreaming}
            />
            <Button
              size="icon"
              className="absolute bottom-2 right-2 h-8 w-8"
              onClick={handleSend}
              disabled={!input.trim() || !hasDocuments || isStreaming}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!isActiveStreaming) setDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-2xl w-full bg-[#2b2b2b] border-[#555555] max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-[#555555] shrink-0">
            <DialogTitle className="font-mono text-sm text-muted-foreground font-normal">
              Question
            </DialogTitle>
            <p className="text-base text-foreground font-medium leading-snug mt-1">
              {activeQuestion?.content}
            </p>
          </DialogHeader>

          <div
            ref={dialogBodyRef}
            className="flex-1 overflow-y-auto px-6 py-4 min-h-0"
          >
            {activeAnswer?.content ? (
              <div className="prose prose-invert prose-sm max-w-none text-foreground leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {activeAnswer.content}
                </ReactMarkdown>
                {isActiveStreaming && (
                  <span className="inline-block w-2 h-4 bg-primary ml-0.5 animate-pulse align-middle" />
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground text-sm animate-pulse">
                <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
                Generating answer...
              </div>
            )}
          </div>

          {!isActiveStreaming && (
            <div className="px-6 pb-5 pt-3 border-t border-[#555555] shrink-0 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-xs border-[#555555] bg-transparent hover:bg-muted"
                onClick={() => setDialogOpen(false)}
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
