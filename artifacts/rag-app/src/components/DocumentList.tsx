import { Trash2, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useListDocuments, useDeleteDocument, getListDocumentsQueryKey, getGetRagStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function DocumentList() {
  const { data: documents, isLoading, error } = useListDocuments();
  const deleteDoc = useDeleteDocument();
  const queryClient = useQueryClient();

  const handleDelete = async (id: number) => {
    deleteDoc.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRagStatsQueryKey() });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-xs text-destructive">
        Failed to load documents
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground italic text-center">
        No documents uploaded yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 max-h-[150px] overflow-y-auto pr-2">
      {documents.map((doc) => (
        <div key={doc.id} className="flex items-center justify-between p-2 rounded-md bg-card border border-border group hover:border-primary/50 transition-colors">
          <div className="flex items-center gap-2 overflow-hidden">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-mono text-xs truncate" title={doc.filename}>{doc.filename}</span>
            <span className="text-[10px] text-muted-foreground shrink-0 bg-muted px-1.5 py-0.5 rounded">
              {doc.chunkCount} chunks
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
            onClick={() => handleDelete(doc.id)}
            disabled={deleteDoc.isPending}
            title="Delete document"
          >
            {deleteDoc.isPending && deleteDoc.variables?.id === doc.id ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </Button>
        </div>
      ))}
    </div>
  );
}
