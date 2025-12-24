import { useState } from "react";
import { X, Plus, GripVertical, Trash2, Edit2 } from "lucide-react";
import { emailService } from "@/services/email.service";
import type { KanbanColumnConfig } from "@/types/email";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface KanbanSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  availableLabels: Array<{ id: string; name: string }>; // Available Gmail labels for mapping
}

export default function KanbanSettings({
  isOpen,
  onClose,
  availableLabels,
}: KanbanSettingsProps) {
  const queryClient = useQueryClient();
  const [editingColumn, setEditingColumn] = useState<KanbanColumnConfig | null>(
    null
  );
  const [isCreating, setIsCreating] = useState(false);

  // Fetch columns
  const { data: columns = [], isLoading } = useQuery({
    queryKey: ["kanbanColumns"],
    queryFn: () => emailService.getKanbanColumns(),
    enabled: isOpen,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (column: Omit<
      KanbanColumnConfig,
      "id" | "user_id" | "created_at" | "updated_at"
    >) => emailService.createKanbanColumn(column),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kanbanColumns"] });
      setIsCreating(false);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({
      columnId,
      column,
    }: {
      columnId: string;
      column: Partial<KanbanColumnConfig>;
    }) => emailService.updateKanbanColumn(columnId, column),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kanbanColumns"] });
      setEditingColumn(null);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (columnId: string) => emailService.deleteKanbanColumn(columnId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kanbanColumns"] });
    },
  });


  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const column: Omit<
      KanbanColumnConfig,
      "id" | "user_id" | "created_at" | "updated_at"
    > = {
      name: formData.get("name") as string,
      column_id: formData.get("column_id") as string,
      order: columns.length,
      gmail_label_id: (formData.get("gmail_label_id") as string) || undefined,
      remove_label_ids: formData
        .get("remove_label_ids")
        ?.toString()
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0) || [],
    };
    createMutation.mutate(column);
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingColumn) return;
    const formData = new FormData(e.currentTarget);
    const updates: Partial<KanbanColumnConfig> = {
      name: formData.get("name") as string,
      gmail_label_id: (formData.get("gmail_label_id") as string) || undefined,
      remove_label_ids: formData
        .get("remove_label_ids")
        ?.toString()
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0) || [],
    };
    updateMutation.mutate({ columnId: editingColumn.column_id, column: updates });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Kanban Board Settings
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Loading columns...
            </div>
          ) : (
            <>
              {/* Existing Columns */}
              <div className="space-y-3 mb-6">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Columns ({columns.length})
                </h3>
                {columns.length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                    No columns configured. Create one below.
                  </div>
                ) : (
                  columns.map((column) => (
                    <div
                      key={column.id}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <GripVertical className="h-4 w-4 text-gray-400" />
                            <span className="font-medium text-gray-900 dark:text-white">
                              {column.name}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              ({column.column_id})
                            </span>
                          </div>
                          {column.gmail_label_id && (
                            <div className="text-xs text-gray-600 dark:text-gray-400 ml-6">
                              Gmail Label: {column.gmail_label_id}
                            </div>
                          )}
                          {column.remove_label_ids &&
                            column.remove_label_ids.length > 0 && (
                              <div className="text-xs text-gray-600 dark:text-gray-400 ml-6">
                                Remove Labels:{" "}
                                {column.remove_label_ids.join(", ")}
                              </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingColumn(column)}
                            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                          >
                            <Edit2 className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                          </button>
                          <button
                            onClick={() =>
                              deleteMutation.mutate(column.column_id)
                            }
                            className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                          >
                            <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Edit Form */}
              {editingColumn && (
                <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20 mb-4">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                    Edit Column: {editingColumn.name}
                  </h4>
                  <form onSubmit={handleUpdate} className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Name
                      </label>
                      <input
                        type="text"
                        name="name"
                        defaultValue={editingColumn.name}
                        required
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Gmail Label ID (to add)
                      </label>
                      <select
                        name="gmail_label_id"
                        defaultValue={editingColumn.gmail_label_id || ""}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      >
                        <option value="">None</option>
                        {availableLabels.map((label) => (
                          <option key={label.id} value={label.id}>
                            {label.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Remove Label IDs (comma-separated, e.g., "INBOX")
                      </label>
                      <input
                        type="text"
                        name="remove_label_ids"
                        defaultValue={
                          editingColumn.remove_label_ids?.join(", ") || ""
                        }
                        placeholder="INBOX, UNREAD"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingColumn(null)}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Create Form */}
              {isCreating && (
                <div className="border border-green-200 dark:border-green-800 rounded-lg p-4 bg-green-50 dark:bg-green-900/20 mb-4">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                    Create New Column
                  </h4>
                  <form onSubmit={handleCreate} className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Name
                      </label>
                      <input
                        type="text"
                        name="name"
                        required
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Column ID (unique identifier, e.g., "archive", "important")
                      </label>
                      <input
                        type="text"
                        name="column_id"
                        required
                        pattern="[a-z0-9_]+"
                        placeholder="archive"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Use lowercase letters, numbers, and underscores only
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Gmail Label ID (to add)
                      </label>
                      <select
                        name="gmail_label_id"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      >
                        <option value="">None</option>
                        {availableLabels.map((label) => (
                          <option key={label.id} value={label.id}>
                            {label.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Remove Label IDs (comma-separated, e.g., "INBOX")
                      </label>
                      <input
                        type="text"
                        name="remove_label_ids"
                        placeholder="INBOX, UNREAD"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Create
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCreating(false)}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Create Button */}
              {!isCreating && !editingColumn && (
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 dark:hover:border-blue-400 dark:hover:text-blue-400 transition-colors"
                >
                  <Plus className="h-5 w-5" />
                  <span>Add New Column</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

