import { Button } from "@/components/ui/button";

interface AttachmentListProps {
  /** Array of attached files */
  attachments: File[];
  /** Remove an attachment by file name */
  onRemove: (fileName: string) => void;
}

/**
 * Displays a list of file attachments with remove buttons.
 */
export function AttachmentList({ attachments, onRemove }: AttachmentListProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
      <div className="flex flex-wrap gap-2">
        {attachments.map((file, index) => (
          <div
            key={`${file.name}-${index}`}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-900 text-sm rounded-lg border border-gray-200"
          >
            <span className="material-symbols-outlined text-lg text-blue-500">
              attachment
            </span>
            <span className="truncate max-w-[200px]">{file.name}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 rounded-full hover:bg-gray-200 p-0 ml-1"
              onClick={() => onRemove(file.name)}
            >
              <span className="material-symbols-outlined text-[16px]">
                close
              </span>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AttachmentList;
