import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Shortcut {
  key: string;
  action: string;
}

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts?: Shortcut[];
}

/**
 * Default keyboard shortcuts
 */
const DEFAULT_SHORTCUTS: Shortcut[] = [
  { key: "j", action: "Email tiếp theo" },
  { key: "k", action: "Email trước" },
  { key: "Enter", action: "Mở email" },
  { key: "s", action: "Đánh sao" },
  { key: "e", action: "Lưu trữ" },
  { key: "c", action: "Soạn email mới" },
  { key: "r", action: "Trả lời" },
  { key: "Esc", action: "Đóng" },
];

/**
 * Dialog displaying keyboard shortcuts for the application
 */
export default function KeyboardShortcutsDialog({
  open,
  onOpenChange,
  shortcuts = DEFAULT_SHORTCUTS,
}: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[240px] p-4">
        <DialogHeader className="pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="material-symbols-outlined text-xl">keyboard</span>
            Phím tắt
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {shortcuts.map((s) => (
            <div key={s.key} className="flex justify-between items-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">{s.action}</span>
              <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
