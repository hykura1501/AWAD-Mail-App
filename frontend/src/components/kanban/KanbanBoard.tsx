import React, { useState } from "react";
import { 
  DndContext, 
  DragOverlay, 
  useSensor, 
  useSensors, 
  PointerSensor, 
  type DragEndEvent,
  type DragStartEvent,
  useDraggable,
  useDroppable
} from "@dnd-kit/core";
import { createPortal } from "react-dom";
import type { Email } from "@/types/email";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

export type KanbanColumn = {
  id: string;
  title: string;
  emails: Email[];
  offset?: number;
  limit?: number;
  total?: number;
};

export type KanbanBoardProps = {
  columns: KanbanColumn[];
  onEmailDrop: (emailId: string, targetColumnId: string) => void;
  // Allow renderCardActions to optionally receive the columnId so callers can
  // decide to show 'Snooze' vs 'Unsnooze' based on the column the email is in.
  renderCardActions?: (email: Email, columnId?: string) => React.ReactNode;
  onPageChange?: (colId: string, dir: 1 | -1) => void;
  onEmailClick?: (emailId: string) => void;
  emailSummaries?: Record<string, { summary: string; loading: boolean }>;
  onRequestSummary?: (emailId: string) => void;
  isLoading?: boolean;
};

// Helper function to strip HTML tags and decode entities
function stripHtml(html: string): string {
  const tmp = document.createElement("DIV");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

// Helper to get clean preview text
function getCleanPreview(email: Email): string {
  const text = email.preview || email.body || "";
  const cleaned = stripHtml(text);
  return cleaned.slice(0, 100);
}

function DraggableEmailCard({ 
  email, 
  renderCardActions, 
  onClick,
  summary,
  summaryLoading,
  onRequestSummary,
  columnId
}: {
  email: Email; 
  renderCardActions?: (email: Email, columnId?: string) => React.ReactNode;
  onClick?: (emailId: string) => void;
  summary?: string;
  summaryLoading?: boolean;
  onRequestSummary?: (emailId: string) => void;
  columnId?: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: email.id,
    data: { email, type: "email", columnId: email.mailbox_id }
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`
        group relative flex flex-col gap-2 rounded-xl border p-4 shadow-sm transition-all duration-200
        bg-white dark:bg-[#1A1D21] border-gray-100 dark:border-gray-800
        hover:shadow-md hover:border-blue-200 dark:hover:border-blue-900/30
        cursor-grab active:cursor-grabbing touch-none
        ${isDragging ? "opacity-30 scale-[0.98] grayscale" : "opacity-100"}
      `}
      onClick={() => onClick?.(email.id)}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate flex-1">
          {email.from}
        </div>
        <div className="text-[10px] text-gray-400 font-medium whitespace-nowrap shrink-0">
          {new Date(email.received_at).toLocaleDateString()}
        </div>
      </div>
      
      <div className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-tight">
        {email.subject}
      </div>
      
      <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
        {getCleanPreview(email)}
      </div>

      {/* Summary Display (when loaded) */}
      {(summary || summaryLoading) && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800/50">
          <div className="flex items-start gap-2 p-2 rounded-lg bg-blue-50/50 dark:bg-blue-900/10">
            <Sparkles className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
            {summaryLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] text-gray-500 dark:text-gray-400">Đang phân tích...</span>
              </div>
            ) : (
              <div className="text-[10px] text-gray-700 dark:text-gray-300 line-clamp-3 leading-relaxed">
                {summary}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons Row */}
      <div className="mt-2 pt-2 flex items-center gap-2 border-t border-gray-50 dark:border-gray-800/50">
        {/* AI Summary Button */}
        {!summary && !summaryLoading && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRequestSummary?.(email.id);
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 text-blue-600 dark:text-blue-400 hover:from-blue-100 hover:to-purple-100 dark:hover:from-blue-900/30 dark:hover:to-purple-900/30 transition-all duration-200 border border-blue-200 dark:border-blue-800/50"
          >
            <Sparkles className="w-3 h-3" />
            <span className="text-[10px]">Summary</span>
          </button>
        )}
        
        {/* Other Action Buttons (Snooze/Unsnooze) */}
        <div className="flex gap-2">
          {renderCardActions?.(email, columnId)}
        </div>
      </div>
    </div>
  );
}

function DroppableColumn({ 
  column, 
  children,
  onPageChange
}: { 
  column: KanbanColumn; 
  children: React.ReactNode;
  onPageChange?: (colId: string, dir: 1 | -1) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { column, type: "column" }
  });

  const currentPage = (column.offset !== undefined && column.limit) 
    ? Math.floor(column.offset / column.limit) + 1 
    : 1;

  // Determine column color accent based on ID
  const getAccentColor = (id: string) => {
    switch(id) {
      case 'inbox': return 'bg-blue-500';
      case 'todo': return 'bg-purple-500';
      case 'done': return 'bg-green-500';
      case 'snoozed': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={`
        flex-1 min-w-0 flex flex-col h-full
        rounded-2xl transition-colors duration-200
        bg-gray-50/50 dark:bg-[#0d1014] border border-transparent
        ${isOver ? "bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/30" : ""}
      `}
    >
      {/* Column Header */}
      <div className="p-4 flex items-center justify-between sticky top-0 bg-transparent z-10">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full shadow-sm ${getAccentColor(column.id)}`} />
          <h3 className="font-bold text-gray-700 dark:text-gray-200 text-base">
            {column.title}
          </h3>
          <span className="px-2 py-0.5 rounded-full bg-gray-200/50 dark:bg-gray-800 text-xs font-medium text-gray-500 dark:text-gray-400">
            {column.emails.length}
          </span>
        </div>

        {/* Pagination */}
        <div className="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-lg p-1 shadow-sm border border-gray-100 dark:border-gray-700">
          <button
            className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
            disabled={column.offset === 0}
            onClick={() => onPageChange?.(column.id, -1)}
          >
            <ChevronLeft className="w-3 h-3 text-gray-600 dark:text-gray-300" />
          </button>
          <span className="text-[10px] font-medium text-gray-500 w-8 text-center tabular-nums">
            {currentPage}
          </span>
          <button
            className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
            disabled={column.emails.length < (column.limit || 20)}
            onClick={() => onPageChange?.(column.id, 1)}
          >
            <ChevronRight className="w-3 h-3 text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      </div>

      {/* Cards Container */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 custom-scrollbar">
        <div className="flex flex-col gap-3 min-h-[150px]">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function KanbanBoard({ 
  columns, 
  onEmailDrop, 
  renderCardActions, 
  onPageChange, 
  onEmailClick,
  emailSummaries = {},
  onRequestSummary,
  isLoading = false
}: KanbanBoardProps) {
  const [activeEmail, setActiveEmail] = useState<Email | null>(null);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === "email") {
      setActiveEmail(event.active.data.current.email);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveEmail(null);

    if (!over) return;

    const activeId = active.id as string;
    let targetColumnId = over.id as string;

    const overType = over.data.current?.type;
    
    if (overType === "email") {
      for (const col of columns) {
        if (col.emails.some(e => e.id === targetColumnId)) {
          targetColumnId = col.id;
          break;
        }
      }
    }

    const isValidColumn = columns.some(c => c.id === targetColumnId);
    
    if (isValidColumn && activeEmail) {
        onEmailDrop(activeId, targetColumnId);
    }
  };

  return (
    <DndContext 
      sensors={sensors} 
      onDragStart={handleDragStart} 
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 w-full h-full p-3 bg-white dark:bg-[#111418] relative">
        {/* Global Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-white/80 dark:bg-[#111418]/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-base font-medium text-gray-700 dark:text-gray-300">Đang tải dữ liệu...</span>
            </div>
          </div>
        )}
        {columns.map((col) => (
          <DroppableColumn 
            key={col.id} 
            column={col} 
            onPageChange={onPageChange}
          >
            {col.emails.map((email) => (
              <DraggableEmailCard
                key={email.id}
                email={email}
                renderCardActions={renderCardActions}
                onClick={onEmailClick}
                summary={emailSummaries[email.id]?.summary}
                summaryLoading={emailSummaries[email.id]?.loading}
                onRequestSummary={onRequestSummary}
                columnId={col.id}
              />
            ))}
          </DroppableColumn>
        ))}
      </div>
      
      {createPortal(
        <DragOverlay dropAnimation={{
          duration: 250,
          easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
        }} zIndex={100}>
          {activeEmail ? (
            <div className="
              w-[320px] bg-white dark:bg-[#1A1D21] rounded-xl shadow-2xl p-4 
              border-2 border-blue-500 cursor-grabbing rotate-3 scale-105 z-50
            ">
              <div className="flex justify-between items-start gap-2 mb-2">
                <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                  {activeEmail.from}
                </div>
              </div>
              <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
                {activeEmail.subject}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {getCleanPreview(activeEmail)}
              </div>
            </div>
          ) : null}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
}
