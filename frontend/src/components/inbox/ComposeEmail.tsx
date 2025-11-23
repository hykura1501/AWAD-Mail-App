import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  X,
  Minimize2,
  Maximize2,
  Send,
  Paperclip,
  Trash2,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";

interface ComposeEmailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSubject?: string;
  initialBody?: string;
}

export default function ComposeEmail({
  open,
  onOpenChange,
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
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);

  useEffect(() => {
    if (open) {
      setSubject(initialSubject);
      setBody(initialBody);
    }
  }, [open, initialSubject, initialBody]);

  const [attachments, setAttachments] = useState<File[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);

  const sendMutation = useMutation({
    mutationFn: async () => {
      // Combine all recipients
      const allTo = [...to];
      if (toInput.trim()) allTo.push(toInput.trim());

      if (allTo.length === 0) {
        throw new Error("Please add at least one recipient");
      }

      // For now, we only support sending to the 'to' list as a comma-separated string
      // Backend needs to be updated to handle CC/BCC if required
      await emailService.sendEmail(
        allTo.join(", "),
        subject,
        body,
        attachments
      );
    },
    onSuccess: () => {
      onOpenChange(false);
      // Reset form
      setTo([]);
      setToInput("");
      setCc([]);
      setBcc([]);
      setSubject("");
      setBody("");
      setAttachments([]);
      // Invalidate queries to refresh lists
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
    },
    onError: (error) => {
      console.error("Failed to send email:", error);
      alert("Failed to send email. Please try again.");
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full h-[90vh] flex flex-col bg-gray-800 border-gray-700 text-white p-0">
        {/* Window Controls */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
          <DialogTitle className="text-lg font-semibold">
            New Message
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-gray-400 hover:text-white hover:bg-gray-700"
              onClick={() => setIsMinimized(!isMinimized)}
            >
              {isMinimized ? (
                <Maximize2 className="h-4 w-4" />
              ) : (
                <Minimize2 className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-gray-400 hover:text-white hover:bg-gray-700"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {!isMinimized && (
          <>
            <DialogHeader className="px-4 pt-4 pb-2">
              {/* To Field */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-gray-300 w-12">To:</Label>
                  <div className="flex-1 flex flex-wrap items-center gap-2 min-h-[40px] px-3 py-2 bg-gray-900 border border-gray-700 rounded">
                    {to.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-gray-700 text-white text-sm rounded-full"
                      >
                        {email}
                        <button
                          onClick={() => handleRemoveRecipient(email, "to")}
                          className="hover:bg-gray-600 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      value={toInput}
                      onChange={(e) => setToInput(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, "to")}
                      onBlur={() => {
                        if (toInput.trim()) handleAddRecipient(toInput, "to");
                      }}
                      placeholder={to.length === 0 ? "Add recipients" : ""}
                      className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-white placeholder-gray-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowCc(!showCc)}
                      className="text-sm text-blue-400 hover:text-blue-300"
                    >
                      Cc
                    </button>
                    <button
                      onClick={() => setShowBcc(!showBcc)}
                      className="text-sm text-blue-400 hover:text-blue-300"
                    >
                      Bcc
                    </button>
                  </div>
                </div>

                {/* Cc Field */}
                {showCc && (
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-gray-300 w-12">Cc:</Label>
                    <div className="flex-1 flex flex-wrap items-center gap-2 min-h-[40px] px-3 py-2 bg-gray-900 border border-gray-700 rounded">
                      {cc.map((email) => (
                        <span
                          key={email}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-gray-700 text-white text-sm rounded-full"
                        >
                          {email}
                          <button
                            onClick={() => handleRemoveRecipient(email, "cc")}
                            className="hover:bg-gray-600 rounded-full p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <input
                        type="text"
                        value={ccInput}
                        onChange={(e) => setCcInput(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, "cc")}
                        onBlur={() => {
                          if (ccInput.trim()) handleAddRecipient(ccInput, "cc");
                        }}
                        placeholder="Add recipients"
                        className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-white placeholder-gray-500"
                      />
                    </div>
                  </div>
                )}

                {/* Bcc Field */}
                {showBcc && (
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-gray-300 w-12">Bcc:</Label>
                    <div className="flex-1 flex flex-wrap items-center gap-2 min-h-[40px] px-3 py-2 bg-gray-900 border border-gray-700 rounded">
                      {bcc.map((email) => (
                        <span
                          key={email}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-gray-700 text-white text-sm rounded-full"
                        >
                          {email}
                          <button
                            onClick={() => handleRemoveRecipient(email, "bcc")}
                            className="hover:bg-gray-600 rounded-full p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
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
                        placeholder="Add recipients"
                        className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-white placeholder-gray-500"
                      />
                    </div>
                  </div>
                )}

                {/* Subject Field */}
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-gray-300 w-12">Subject:</Label>
                  <Input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder=""
                    className="flex-1 bg-gray-900 border-gray-700 text-white placeholder-gray-500"
                  />
                </div>
              </div>
            </DialogHeader>

            {/* Message Body */}
            <div className="flex-1 px-4 py-2">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Compose your message..."
                className="w-full h-full bg-gray-900 border border-gray-700 rounded-lg p-4 text-white placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Formatting Toolbar */}
            <div className="px-4 py-2 border-t border-gray-700 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-gray-700"
                title="Bold"
              >
                <Bold className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-gray-700"
                title="Italic"
              >
                <Italic className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-gray-700"
                title="Underline"
              >
                <Underline className="h-4 w-4" />
              </Button>
              <div className="w-px h-6 bg-gray-700" />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-gray-700"
                title="Unordered List"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-gray-700"
                title="Ordered List"
              >
                <ListOrdered className="h-4 w-4" />
              </Button>
              <div className="w-px h-6 bg-gray-700" />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-gray-700"
                title="Insert Link"
              >
                <LinkIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-gray-700"
                title="Insert Image"
              >
                <ImageIcon className="h-4 w-4" />
              </Button>
            </div>

            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-700">
                <div className="flex flex-wrap gap-2">
                  {attachments.map((file, index) => (
                    <span
                      key={`${file.name}-${index}`}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-gray-700 text-white text-sm rounded-full"
                    >
                      {file.name}
                      <button
                        onClick={() => handleRemoveAttachment(file.name)}
                        className="hover:bg-gray-600 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom Bar */}
            <div className="px-4 py-3 border-t border-gray-700 flex items-center justify-between bg-gray-800">
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleSend}
                  disabled={sendMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {sendMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-white hover:bg-gray-700"
                  onClick={handleAddAttachment}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-400">Draft saved</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-white hover:bg-gray-700"
                  onClick={handleDiscard}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
