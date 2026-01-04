import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface RecipientFieldProps {
  /** Label for field (To, Cc, Bcc) */
  label: string;
  /** Array of added recipients */
  recipients: string[];
  /** Current input value */
  inputValue: string;
  /** Update input value */
  onInputChange: (value: string) => void;
  /** Add a recipient */
  onAdd: (email: string) => void;
  /** Remove a recipient */
  onRemove: (email: string) => void;
  /** Handle keyboard events (Enter/comma to add) */
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Show border bottom */
  showBorder?: boolean;
  /** Additional actions (Cc/Bcc toggle buttons) */
  actions?: React.ReactNode;
}

/**
 * Reusable recipient input field for To, Cc, Bcc.
 * Shows chips for added recipients with remove button.
 */
export function RecipientField({
  label,
  recipients,
  inputValue,
  onInputChange,
  onAdd,
  onRemove,
  onKeyDown,
  placeholder,
  showBorder = true,
  actions,
}: RecipientFieldProps) {
  return (
    <div
      className={`flex items-start gap-3 pb-2 ${
        showBorder ? "border-b border-gray-200" : ""
      }`}
    >
      <Label className="text-sm text-gray-500 w-12 pt-2 font-medium">
        {label}
      </Label>
      <div className="flex-1 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {recipients.map((email) => (
            <span
              key={email}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-900 text-sm rounded-full border border-gray-200"
            >
              {email}
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 rounded-full hover:bg-gray-200 p-0"
                onClick={() => onRemove(email)}
              >
                <span className="material-symbols-outlined text-[16px]">
                  close
                </span>
              </Button>
            </span>
          ))}
          <input
            type="text"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => {
              if (inputValue.trim()) onAdd(inputValue);
            }}
            placeholder={recipients.length === 0 ? placeholder : ""}
            className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-gray-900 placeholder-gray-400 text-sm py-1.5"
          />
        </div>
        {actions}
      </div>
    </div>
  );
}

export default RecipientField;
