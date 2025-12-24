import { useState, useMemo } from "react";
import { X, Plus, Trash2, Edit2 } from "lucide-react";
import { emailService } from "@/services/email.service";
import type { KanbanColumnConfig } from "@/types/email";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Default columns that are always present (fixed, cannot be deleted)
// With default Gmail label mappings
const DEFAULT_COLUMNS: Array<{ 
  column_id: string; 
  name: string; 
  isDefault: true;
  gmail_label_id?: string;
  remove_label_ids?: string[];
}> = [
  { column_id: "inbox", name: "Inbox", isDefault: true, gmail_label_id: "INBOX", remove_label_ids: ["INBOX"] },
  { column_id: "todo", name: "To Do", isDefault: true, gmail_label_id: "IMPORTANT", remove_label_ids: ["IMPORTANT"] },
  { column_id: "done", name: "Done", isDefault: true, gmail_label_id: "STARRED", remove_label_ids: ["STARRED"] },
  { column_id: "snoozed", name: "Snoozed", isDefault: true }, // Managed locally, no Gmail label
];

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

  // Fetch columns from API
  const { data: apiColumns = [], isLoading } = useQuery({
    queryKey: ["kanbanColumns"],
    queryFn: () => emailService.getKanbanColumns(),
    enabled: isOpen,
  });

  // Merge default columns with API columns
  const columns = useMemo(() => {
    const result: Array<KanbanColumnConfig & { isDefault?: boolean }> = [];
    
    // Add default columns first, merging with API data if exists
    for (const defaultCol of DEFAULT_COLUMNS) {
      const apiCol = apiColumns.find(c => c.column_id === defaultCol.column_id);
      if (apiCol) {
        result.push({ ...apiCol, isDefault: true });
      } else {
        // Create a placeholder for default column not yet in DB
        // Use default label mappings from DEFAULT_COLUMNS
        result.push({
          id: "",
          user_id: "",
          column_id: defaultCol.column_id,
          name: defaultCol.name,
          order: DEFAULT_COLUMNS.indexOf(defaultCol),
          gmail_label_id: defaultCol.gmail_label_id || "",
          remove_label_ids: defaultCol.remove_label_ids || [],
          created_at: "",
          updated_at: "",
          isDefault: true,
        });
      }
    }
    
    // Add custom columns (non-default) after
    const defaultIds = new Set(DEFAULT_COLUMNS.map(c => c.column_id));
    for (const col of apiColumns) {
      if (!defaultIds.has(col.column_id)) {
        result.push({ ...col, isDefault: false });
      }
    }
    
    // Sort by order field
    result.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    
    return result;
  }, [apiColumns]);

  // Get set of labels already used by other columns
  const usedLabels = useMemo(() => {
    const labelMap = new Map<string, string>(); // labelId -> columnName
    for (const col of columns) {
      if (col.gmail_label_id) {
        labelMap.set(col.gmail_label_id, col.name);
      }
    }
    return labelMap;
  }, [columns]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (column: Omit<
      KanbanColumnConfig,
      "id" | "user_id" | "created_at" | "updated_at"
    >) => emailService.createKanbanColumn(column),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kanbanColumns"] });
      setIsCreating(false);
      setCreateRemoveLabels("");
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
      setEditRemoveLabels("");
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
    const gmailLabelId = (formData.get("gmail_label_id") as string) || "";
    
    // Check if label is already used by another column
    if (gmailLabelId) {
      const existingColumn = columns.find(
        (col) => col.gmail_label_id === gmailLabelId
      );
      if (existingColumn) {
        setDuplicateLabelError({
          labelId: gmailLabelId,
          existingColumnName: existingColumn.name,
        });
        return;
      }
    }

    const column: Omit<
      KanbanColumnConfig,
      "id" | "user_id" | "created_at" | "updated_at"
    > = {
      name: formData.get("name") as string,
      column_id: formData.get("column_id") as string,
      order: columns.length,
      gmail_label_id: gmailLabelId || undefined,
      remove_label_ids: formData
        .get("remove_label_ids")
        ?.toString()
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0) || [],
    };
    createMutation.mutate(column);
  };

  // State for confirmation dialog when labels mismatch
  const [showMismatchWarning, setShowMismatchWarning] = useState(false);
  // State for duplicate label error modal
  const [duplicateLabelError, setDuplicateLabelError] = useState<{
    labelId: string;
    existingColumnName: string;
  } | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<{
    updates: Partial<KanbanColumnConfig>;
    isCreate: boolean;
    columnId: string;
  } | null>(null);

  // State for auto-syncing add label to remove label in forms
  const [editRemoveLabels, setEditRemoveLabels] = useState("");
  const [createRemoveLabels, setCreateRemoveLabels] = useState("");

  // Handler for when add label changes - auto sync to remove label
  const handleAddLabelChange = (e: React.ChangeEvent<HTMLSelectElement>, formType: "edit" | "create") => {
    const newLabel = e.target.value;
    if (formType === "edit") {
      setEditRemoveLabels(newLabel);
    } else {
      setCreateRemoveLabels(newLabel);
    }
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingColumn) return;
    const formData = new FormData(e.currentTarget);
    const gmailLabelId = (formData.get("gmail_label_id") as string) || "";
    const removeLabelIdsStr = formData.get("remove_label_ids")?.toString() || "";
    const removeLabelIds = removeLabelIdsStr
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Check if label is already used by another column
    if (gmailLabelId) {
      const existingColumn = columns.find(
        (col) => col.gmail_label_id === gmailLabelId && col.column_id !== editingColumn.column_id
      );
      if (existingColumn) {
        setDuplicateLabelError({
          labelId: gmailLabelId,
          existingColumnName: existingColumn.name,
        });
        return;
      }
    }

    const updates: Partial<KanbanColumnConfig> = {
      name: formData.get("name") as string,
      gmail_label_id: gmailLabelId || undefined,
      remove_label_ids: removeLabelIds,
    };

    // Check if add and remove labels are mismatched
    // Warn if: 1) Only one is set, or 2) Both set but different
    const hasAddLabel = !!gmailLabelId;
    const hasRemoveLabels = removeLabelIds.length > 0;
    const hasMismatch = (hasAddLabel !== hasRemoveLabels) || // One set, other empty
      (hasAddLabel && hasRemoveLabels && !removeLabelIds.includes(gmailLabelId)); // Both set but different

    const isCreateMode = editingColumn.id === "" && !!(editingColumn as { isDefault?: boolean }).isDefault;

    if (hasMismatch) {
      // Show warning dialog
      setPendingUpdate({
        updates,
        isCreate: isCreateMode,
        columnId: editingColumn.column_id,
      });
      setShowMismatchWarning(true);
      return;
    }

    // No mismatch, proceed directly
    if (isCreateMode) {
      const newColumn = {
        name: updates.name || editingColumn.name,
        column_id: editingColumn.column_id,
        order: editingColumn.order,
        gmail_label_id: updates.gmail_label_id,
        remove_label_ids: updates.remove_label_ids || [],
      };
      createMutation.mutate(newColumn);
    } else {
      updateMutation.mutate({ columnId: editingColumn.column_id, column: updates });
    }
  };

  const confirmMismatchUpdate = () => {
    if (!pendingUpdate || !editingColumn) return;

    if (pendingUpdate.isCreate) {
      const newColumn = {
        name: pendingUpdate.updates.name || editingColumn.name,
        column_id: pendingUpdate.columnId,
        order: editingColumn.order,
        gmail_label_id: pendingUpdate.updates.gmail_label_id,
        remove_label_ids: pendingUpdate.updates.remove_label_ids || [],
      };
      createMutation.mutate(newColumn);
    } else {
      updateMutation.mutate({ 
        columnId: pendingUpdate.columnId, 
        column: pendingUpdate.updates 
      });
    }

    setShowMismatchWarning(false);
    setPendingUpdate(null);
  };

  const cancelMismatchUpdate = () => {
    setShowMismatchWarning(false);
    setPendingUpdate(null);
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
                      key={column.column_id}
                      className={`border rounded-lg p-3 ${
                        column.isDefault 
                          ? "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20" 
                          : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {column.name}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              ({column.column_id})
                            </span>
                            {column.isDefault && (
                              <span className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                                Default
                              </span>
                            )}
                          </div>
                          {column.gmail_label_id && (
                            <div className="text-xs text-gray-600 dark:text-gray-400 ml-0">
                              Gmail Label: {column.gmail_label_id}
                            </div>
                          )}
                          {column.remove_label_ids &&
                            column.remove_label_ids.length > 0 && (
                              <div className="text-xs text-gray-600 dark:text-gray-400 ml-0">
                                Remove Labels:{" "}
                                {column.remove_label_ids.join(", ")}
                              </div>
                            )}
                        </div>
                        <div className="flex items-center gap-1">

                          <button
                            onClick={() => {
                              setEditingColumn(column);
                              setEditRemoveLabels(column.remove_label_ids?.join(", ") || "");
                            }}
                            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                          >
                            <Edit2 className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                          </button>
                          {!column.isDefault && (
                            <button
                              onClick={() =>
                                deleteMutation.mutate(column.column_id)
                              }
                              className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                            >
                              <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                            </button>
                          )}
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
                        onChange={(e) => handleAddLabelChange(e, "edit")}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      >
                        <option value="">None</option>
                        {availableLabels.map((label) => {
                          const usedByColumn = usedLabels.get(label.id);
                          // Allow current column's own label
                          const isOwnLabel = editingColumn.gmail_label_id === label.id;
                          const isDisabled = !isOwnLabel && !!usedByColumn;
                          return (
                            <option 
                              key={label.id} 
                              value={label.id}
                              disabled={isDisabled}
                            >
                              {label.name}{usedByColumn && !isOwnLabel ? ` (used by ${usedByColumn})` : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Remove Label IDs (auto-synced with Add label)
                      </label>
                      <input
                        type="text"
                        name="remove_label_ids"
                        value={editRemoveLabels || editingColumn.remove_label_ids?.join(", ") || ""}
                        onChange={(e) => setEditRemoveLabels(e.target.value)}
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
                        onClick={() => {
                          setEditingColumn(null);
                          setEditRemoveLabels("");
                        }}
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
                        onChange={(e) => handleAddLabelChange(e, "create")}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      >
                        <option value="">None</option>
                        {availableLabels.map((label) => {
                          const usedByColumn = usedLabels.get(label.id);
                          return (
                            <option 
                              key={label.id} 
                              value={label.id}
                              disabled={!!usedByColumn}
                            >
                              {label.name}{usedByColumn ? ` (used by ${usedByColumn})` : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Remove Label IDs (auto-synced with Add label)
                      </label>
                      <input
                        type="text"
                        name="remove_label_ids"
                        value={createRemoveLabels}
                        onChange={(e) => setCreateRemoveLabels(e.target.value)}
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

      {/* Mismatch Warning Modal */}
      {showMismatchWarning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <span className="text-yellow-600 dark:text-yellow-400 text-xl">⚠️</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Label Configuration Mismatch
              </h3>
            </div>
            
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              The <strong>Gmail Label (Add)</strong> is different from <strong>Remove Labels</strong>. 
              This means when an email enters this column, a different label will be added than what's removed when leaving.
            </p>
            
            <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
              <strong>Recommendation:</strong> The Add and Remove labels should typically be the same for consistent behavior.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelMismatchUpdate}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmMismatchUpdate}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
              >
                Save Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Label Error Modal */}
      {duplicateLabelError && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <span className="text-red-600 dark:text-red-400 text-xl">🚫</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Label Already Used
              </h3>
            </div>
            
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              The label <strong className="text-red-600 dark:text-red-400">"{duplicateLabelError.labelId}"</strong> is already 
              mapped to column <strong>"{duplicateLabelError.existingColumnName}"</strong>.
            </p>
            
            <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
              Each Gmail label can only be mapped to <strong>one column</strong>. 
              Please choose a different label or remove the mapping from the other column first.
            </p>

            <div className="flex justify-end">
              <button
                onClick={() => setDuplicateLabelError(null)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                OK, I Understand
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

