import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { emailService } from "@/services/email.service";
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
import { toast } from "sonner";

interface ComposeEmailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTo?: string[];
  initialCc?: string[];
  initialSubject?: string;
  initialBody?: string;
}

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
];

export default function ComposeEmail({
  open,
  onOpenChange,
  initialTo = [],
  initialCc = [],
  initialSubject = "",
  initialBody = "",
}: ComposeEmailProps) {
  const queryClient = useQueryClient();
  const [to, setTo] = useState<string[]>([]);
  const [toInput, setToInput] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [cc, setCc] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState("");
  const [bcc, setBcc] = useState<string[]>([]);
  const [bccInput, setBccInput] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);

  // Track previous open state to detect transitions
  const prevOpen = useRef(open);
  
  useEffect(() => {
    // Dialog just opened - load initial data
    if (open && !prevOpen.current) {
      if (initialTo.length > 0 || initialCc.length > 0 || initialSubject || initialBody) {
        // Use setTimeout to avoid setState during render
        setTimeout(() => {
          setTo(initialTo);
          setCc(initialCc);
          if (initialCc.length > 0) setShowCc(true);
          setSubject(initialSubject);
          setBody(initialBody);
        }, 0);
      }
    }
    // Dialog just closed - reset form
    else if (!open && prevOpen.current) {
      setTimeout(() => {
        setTo([]);
        setToInput("");
        setCc([]);
        setCcInput("");
        setBcc([]);
        setBccInput("");
        setSubject("");
        setBody("");
        setAttachments([]);
        setShowCc(false);
        setShowBcc(false);
        setIsMinimized(false);
      }, 0);
    }
    
    prevOpen.current = open;
  }, [open, initialTo, initialCc, initialSubject, initialBody]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      // Combine all recipients
      const allTo = [...to];
      if (toInput.trim()) allTo.push(toInput.trim());

      if (allTo.length === 0) {
        throw new Error("Vui lòng thêm ít nhất một người nhận");
      }

      const allCc = [...cc];
      if (ccInput.trim()) allCc.push(ccInput.trim());

      const allBcc = [...bcc];
      if (bccInput.trim()) allBcc.push(bccInput.trim());

      // Inject styles into blockquote tags before sending to ensure they appear correctly in the recipient's email
      // ReactQuill might strip these styles during editing
      const processedBody = body.replace(
        /<blockquote>/g,
        '<blockquote style="margin: 0 0 0 0.8ex; border-left: 1px #ccc solid; padding-left: 1ex;">'
      );

      await emailService.sendEmail(
        allTo.join(", "),
        allCc.join(", "),
        allBcc.join(", "),
        subject,
        processedBody,
        attachments
      );
    },
    onSuccess: () => {
      toast.success("Đã gửi email thành công");
      onOpenChange(false);
      // Reset form
      setTo([]);
      setToInput("");
      setCc([]);
      setBcc([]);
      setSubject("");
      setBody("");
      setAttachments([]);
      setShowCc(false);
      setShowBcc(false);
      // Invalidate queries to refresh lists
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
    },
    onError: (error: Error) => {
      console.error("Failed to send email:", error);
      toast.error(error?.message || "Không thể gửi email. Vui lòng thử lại");
    },
  });

  const handleAddRecipient = (value: string, type: "to" | "cc" | "bcc") => {
    if (!value.trim()) return;

    const email = value.trim();
    if (type === "to") {
      setTo([...to, email]);
      setToInput("");
    } else if (type === "cc") {
      setCc([...cc, email]);
      setCcInput("");
    } else {
      setBcc([...bcc, email]);
      setBccInput("");
    }
  };

  const handleRemoveRecipient = (email: string, type: "to" | "cc" | "bcc") => {
    if (type === "to") {
      setTo(to.filter((e) => e !== email));
    } else if (type === "cc") {
      setCc(cc.filter((e) => e !== email));
    } else {
      setBcc(bcc.filter((e) => e !== email));
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    type: "to" | "cc" | "bcc"
  ) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const value = (e.target as HTMLInputElement).value;
      handleAddRecipient(value, type);
    }
  };

  const handleAddAttachment = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        const newAttachments = Array.from(files);
        setAttachments([...attachments, ...newAttachments]);
      }
    };
    input.click();
  };

  const handleRemoveAttachment = (fileName: string) => {
    setAttachments(attachments.filter((file) => file.name !== fileName));
  };

  const handleSend = () => {
    sendMutation.mutate();
  };

  const handleDiscard = () => {
    onOpenChange(false);
    setTo([]);
    setCc([]);
    setBcc([]);
    setSubject("");
    setBody("");
    setAttachments([]);
  };

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
                  <div className="flex items-start gap-3 border-b border-gray-200 pb-2">
                    <Label className="text-sm text-gray-500 w-12 pt-2 font-medium">
                      To
                    </Label>
                    <div className="flex-1 flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {to.map((email) => (
                          <span
                            key={email}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-900 text-sm rounded-full border border-gray-200"
                          >
                            {email}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4 rounded-full hover:bg-gray-200 p-0"
                              onClick={() => handleRemoveRecipient(email, "to")}
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                close
                              </span>
                            </Button>
                          </span>
                        ))}
                        <input
                          type="text"
                          value={toInput}
                          onChange={(e) => setToInput(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, "to")}
                          onBlur={() => {
                            if (toInput.trim())
                              handleAddRecipient(toInput, "to");
                          }}
                          placeholder={to.length === 0 ? "Recipients" : ""}
                          className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-gray-900 placeholder-gray-400 text-sm py-1.5"
                        />
                      </div>
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
                    </div>
                  </div>

                  {/* Cc Field */}
                  {showCc && (
                    <div className="flex items-start gap-3 border-b border-gray-200 pb-2 animate-in slide-in-from-top-2 duration-200">
                      <Label className="text-sm text-gray-500 w-12 pt-2 font-medium">
                        Cc
                      </Label>
                      <div className="flex-1 flex flex-wrap items-center gap-2">
                        {cc.map((email) => (
                          <span
                            key={email}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-900 text-sm rounded-full border border-gray-200"
                          >
                            {email}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4 rounded-full hover:bg-gray-200 p-0"
                              onClick={() => handleRemoveRecipient(email, "cc")}
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                close
                              </span>
                            </Button>
                          </span>
                        ))}
                        <input
                          type="text"
                          value={ccInput}
                          onChange={(e) => setCcInput(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, "cc")}
                          onBlur={() => {
                            if (ccInput.trim())
                              handleAddRecipient(ccInput, "cc");
                          }}
                          className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-gray-900 placeholder-gray-400 text-sm py-1.5"
                        />
                      </div>
                    </div>
                  )}

                  {/* Bcc Field */}
                  {showBcc && (
                    <div className="flex items-start gap-3 border-b border-gray-200 pb-2 animate-in slide-in-from-top-2 duration-200">
                      <Label className="text-sm text-gray-500 w-12 pt-2 font-medium">
                        Bcc
                      </Label>
                      <div className="flex-1 flex flex-wrap items-center gap-2">
                        {bcc.map((email) => (
                          <span
                            key={email}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-900 text-sm rounded-full border border-gray-200"
                          >
                            {email}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4 rounded-full hover:bg-gray-200 p-0"
                              onClick={() =>
                                handleRemoveRecipient(email, "bcc")
                              }
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                close
                              </span>
                            </Button>
                          </span>
                        ))}
                        <input
                          type="text"
                          value={bccInput}
                          onChange={(e) => setBccInput(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, "bcc")}
                          onBlur={() => {
                            if (bccInput.trim())
                              handleAddRecipient(bccInput, "bcc");
                          }}
                          className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-gray-900 placeholder-gray-400 text-sm py-1.5"
                        />
                      </div>
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
                      className="flex-1 bg-transparent border-none text-gray-900  focus-visible:ring-0 px-0 h-auto py-1.5 font-medium text-base"
                    />
                  </div>
                </div>
              </DialogHeader>

              {/* Message Body */}
              <div className="flex-1 flex flex-col min-h-0 bg-white">
                <ReactQuill
                  theme="snow"
                  value={body}
                  onChange={setBody}
                  modules={modules}
                  formats={formats}
                  placeholder="Write your message here..."
                  className="flex-1 flex flex-col min-h-0 [&_.ql-container]:flex-1 [&_.ql-container]:overflow-y-auto [&_.ql-container]:text-base [&_.ql-editor]:text-gray-900 [&_.ql-toolbar]:border-gray-200 [&_.ql-container]:border-none [&_.ql-toolbar]:bg-gray-50 [&_.ql-stroke]:stroke-gray-500  [&_.ql-fill]:fill-gray-500 [&_.ql-picker]:text-gray-500"
                />
              </div>

              {/* Attachments */}
              {attachments.length > 0 && (
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
                        <span className="truncate max-w-[200px]">
                          {file.name}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 rounded-full hover:bg-gray-200 p-0 ml-1"
                          onClick={() => handleRemoveAttachment(file.name)}
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            close
                          </span>
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Bar */}
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSend}
                  disabled={sendMutation.isPending}
                  className="bg-primary hover:bg-primary/90 text-white rounded-full px-6 h-9 text-sm font-medium"
                >
                  {sendMutation.isPending ? (
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
