export type KanbanToggleProps = {
  isKanban: boolean;
  onToggle: () => void;
};

export default function KanbanToggle({
  isKanban,
  onToggle,
}: KanbanToggleProps) {
  return (
    <button
      className="h-8 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-linear-to-r from-blue-400 to-blue-500 dark:from-blue-600 dark:to-blue-700 text-white text-xs font-semibold hover:from-blue-600 hover:to-blue-700 dark:hover:from-blue-700 dark:hover:to-blue-800 transition-all duration-200 shadow-sm hover:shadow-md"
      onClick={onToggle}
    >
      <span className="material-symbols-outlined text-[16px]">
        {isKanban ? "view_list" : "view_kanban"}
      </span>
      <span className="hidden sm:inline">
        {isKanban ? "Truyền thống" : "Kanban"}
      </span>
    </button>
  );
}
