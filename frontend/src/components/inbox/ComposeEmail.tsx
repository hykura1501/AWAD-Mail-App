import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useComposeEmail } from "@/hooks";
import { RecipientField, AttachmentList } from "./compose";
import type { Attachment } from "@/types/email";

interface ComposeEmailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTo?: string[];
  initialCc?: string[];
  initialSubject?: string;
  initialBody?: string;
  /** Original email HTML content to be quoted */
  quotedContent?: string;
  /** Header for quoted content */
  quotedHeader?: string;
  /** Original email ID for downloading attachments */
  originalEmailId?: string;
  /** Original attachments to forward */
  originalAttachments?: Attachment[];
  /** When true, download and attach all original attachments */
  forwardAttachments?: boolean;
  /** When true, only download inline images for reply */
  includeInlineImages?: boolean;
}

// Quill editor configuration
const modules = {
  toolbar: [
    [{ header: [1, 2, false] }],
    ["bold", "italic", "underline", "strike", "blockquote"],
    [
      { list: "ordered" },
      { list: "bullet" },
      { indent: "-1" },
      { indent: "+1" },
    ],
    ["link", "image"],
    ["clean"],
  ],
};

const formats = [
  "header",
  "bold",
  "italic",
  "underline",
  "strike",
  "blockquote",
  "list",
  "bullet",
  "indent",
  "link",
  "image",
  "align",
  "color",
  "background",
  "direction",
  "font",
  "size",
  "script",
  "code-block",
  "code",
];

export default function ComposeEmail({
  open,
  onOpenChange,
  initialTo = [],
  initialCc = [],
  initialSubject = "",
  initialBody = "",
  quotedContent = "",
  quotedHeader = "",
  originalEmailId,
  originalAttachments,
  forwardAttachments = false,
  includeInlineImages = false,
}: ComposeEmailProps) {
  // Use custom hook for all form logic
  const compose = useComposeEmail({
    open,
    onOpenChange,
    initialTo,
    initialCc,
    initialSubject,
    initialBody,
    quotedContent,
    quotedHeader,
    originalEmailId,
    originalAttachments,
    forwardAttachments,
    includeInlineImages,
  });

  const {
    recipients,
    setToInput,
    setCcInput,
    setBccInput,
    handleAddRecipient,
    handleRemoveRecipient,
    handleKeyDown,
    subject,
    setSubject,
    body,
    setBody,
    quotedHtml,
    quotedHeaderText,
    attachments,
    handleAddAttachment,
    handleRemoveAttachment,
    showCc,
    setShowCc,
    showBcc,
    setShowBcc,
    isMinimized,
    setIsMinimized,
    handleSend,
    handleDiscard,
    isSending,
  } = compose;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={!isMinimized}>
      <DialogContent
        showCloseButton={false}
        hideOverlay={isMinimized}
        className={cn(
          "p-0 gap-0 bg-white border-gray-200 shadow-2xl transition-all duration-300 ease-in-out overflow-hidden flex flex-col",
          isMinimized
            ? "w-60! h-12 bottom-0 right-10 translate-y-0 top-auto left-[93%] rounded-t-lg rounded-b-none border-b-0"
            : "w-[70vw]! max-w-[1400px] h-[90vh] top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] rounded-xl border"
        )}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div
          className={cn(
            "flex items-center justify-between px-4 py-2.5 bg-gray-100 cursor-pointer shrink-0",
            isMinimized ? "rounded-t-lg" : ""
          )}
          onClick={() => isMinimized && setIsMinimized(false)}
        >
          <DialogTitle className="text-sm font-medium text-gray-900">
            New Message
          </DialogTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-500 hover:text-gray-900 hover:bg-gray-200"
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(!isMinimized);
              }}
            >
              <span className="material-symbols-outlined text-[18px]">
                {isMinimized ? "open_in_full" : "minimize"}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-500 hover:text-gray-900 hover:bg-gray-200"
              onClick={(e) => {
                e.stopPropagation();
                onOpenChange(false);
              }}
            >
              <span className="material-symbols-outlined text-[18px]">
                close
              </span>
            </Button>
          </div>
        </div>

        {!isMinimized && (
          <>
            <div className="flex-1 flex flex-col overflow-hidden">
              <DialogHeader className="px-4 pt-2 space-y-0 shrink-0">
                <div className="flex flex-col gap-1">
                  {/* To Field */}
                  <RecipientField
                    label="To"
                    recipients={recipients.to}
                    inputValue={recipients.toInput}
                    onInputChange={setToInput}
                    onAdd={(email) => handleAddRecipient(email, "to")}
                    onRemove={(email) => handleRemoveRecipient(email, "to")}
                    onKeyDown={(e) => handleKeyDown(e, "to")}
                    placeholder="Recipients"
                    actions={
                      <div className="flex gap-3 text-xs">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowCc(!showCc)}
                          className={cn(
                            "h-auto p-0 hover:bg-transparent transition-colors",
                            showCc
                              ? "text-gray-900 font-medium"
                              : "text-gray-500"
                          )}
                        >
                          Cc
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowBcc(!showBcc)}
                          className={cn(
                            "h-auto p-0 hover:bg-transparent transition-colors",
                            showBcc
                              ? "text-gray-900 font-medium"
                              : "text-gray-500"
                          )}
                        >
                          Bcc
                        </Button>
                      </div>
                    }
                  />

                  {/* Cc Field */}
                  {showCc && (
                    <div className="animate-in slide-in-from-top-2 duration-200">
                      <RecipientField
                        label="Cc"
                        recipients={recipients.cc}
                        inputValue={recipients.ccInput}
                        onInputChange={setCcInput}
                        onAdd={(email) => handleAddRecipient(email, "cc")}
                        onRemove={(email) => handleRemoveRecipient(email, "cc")}
                        onKeyDown={(e) => handleKeyDown(e, "cc")}
                      />
                    </div>
                  )}

                  {/* Bcc Field */}
                  {showBcc && (
                    <div className="animate-in slide-in-from-top-2 duration-200">
                      <RecipientField
                        label="Bcc"
                        recipients={recipients.bcc}
                        inputValue={recipients.bccInput}
                        onInputChange={setBccInput}
                        onAdd={(email) => handleAddRecipient(email, "bcc")}
                        onRemove={(email) => handleRemoveRecipient(email, "bcc")}
                        onKeyDown={(e) => handleKeyDown(e, "bcc")}
                      />
                    </div>
                  )}

                  {/* Subject Field */}
                  <div className="flex items-center gap-3 pb-2">
                    <Label className="text-sm text-gray-500 w-12">
                      Subject
                    </Label>
                    <Input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder=""
                      className="flex-1 bg-transparent border-none text-gray-900 focus-visible:ring-0 px-0 h-auto py-1.5 font-medium text-base"
                    />
                  </div>
                </div>
              </DialogHeader>

              {/* Message Body */}
              <div className="flex-1 flex flex-col min-h-0 bg-white overflow-y-auto">
                <ReactQuill
                  theme="snow"
                  value={body}
                  onChange={setBody}
                  modules={modules}
                  formats={formats}
                  placeholder="Write your message here..."
                  className={cn(
                    "flex flex-col",
                    quotedHtml
                      ? "[&_.ql-container]:min-h-[120px]"
                      : "flex-1 min-h-0 [&_.ql-container]:flex-1",
                    "[&_.ql-container]:overflow-y-auto [&_.ql-container]:text-base [&_.ql-editor]:text-gray-900 [&_.ql-toolbar]:border-gray-200 [&_.ql-container]:border-none [&_.ql-toolbar]:bg-gray-50 [&_.ql-stroke]:stroke-gray-500 [&_.ql-fill]:fill-gray-500 [&_.ql-picker]:text-gray-500"
                  )}
                />

                {/* Quoted Original Email Content */}
                {quotedHtml && (
                  <div className="flex-1 flex flex-col min-h-0 border-t border-gray-200 px-4 py-2 bg-gray-50">
                    {quotedHeaderText && (
                      <p className="text-xs text-gray-500 mb-2 shrink-0">
                        {quotedHeaderText}
                      </p>
                    )}
                    <div className="flex-1 min-h-0 border-l-2 border-gray-300 pl-3 overflow-hidden">
                      <iframe
                        srcDoc={`
                          <!DOCTYPE html>
                          <html>
                          <head>
                            <base target="_blank" />
                            <style>
                              body {
                                font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                                font-size: 14px;
                                line-height: 1.5;
                                color: #374151;
                                margin: 0;
                                padding: 0;
                                background: transparent;
                              }
                              a { color: #2563eb; }
                              img { max-width: 100%; height: auto; }
                            </style>
                          </head>
                          <body>${quotedHtml}</body>
                          </html>
                        `}
                        title="Quoted Email Content"
                        className="w-full h-full border-none bg-transparent"
                        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Attachments */}
              <AttachmentList
                attachments={attachments}
                onRemove={handleRemoveAttachment}
              />
            </div>

            {/* Bottom Bar */}
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSend}
                  disabled={isSending}
                  className="bg-primary hover:bg-primary/90 text-white rounded-full px-6 h-9 text-sm font-medium"
                >
                  {isSending ? (
                    <span className="material-symbols-outlined animate-spin mr-2 text-xl">
                      progress_activity
                    </span>
                  ) : (
                    <span className="material-symbols-outlined mr-2 text-xl">
                      send
                    </span>
                  )}
                  Send
                </Button>
                <div className="h-6 w-px bg-gray-200 mx-2"></div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full h-10 w-10 text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                  onClick={handleAddAttachment}
                  title="Attach files"
                >
                  <span className="material-symbols-outlined text-[22px]">
                    attach_file
                  </span>
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full h-10 w-10 text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                  onClick={handleDiscard}
                  title="Delete draft"
                >
                  <span className="material-symbols-outlined text-[22px]">
                    delete
                  </span>
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
