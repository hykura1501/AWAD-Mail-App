import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { emailService } from "@/services/email.service";
import { Button } from "@/components/ui/button";
import {
  Star,
  StarOff,
  Reply,
  ReplyAll,
  Forward,
  Trash2,
  Archive,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Mail,
  Download,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { format } from "date-fns";
import type { Email } from "@/types/email";
import { API_BASE_URL } from "@/config/api";
import { getAccessToken } from "@/lib/api-client";

interface EmailDetailProps {
  emailId: string | null;
  onToggleStar: (emailId: string) => void;
  onForward?: (email: Email) => void;
}

export default function EmailDetail({
  emailId,
  onToggleStar,
  onForward,
}: EmailDetailProps) {
  const queryClient = useQueryClient();

  const { data: email, isLoading } = useQuery<Email>({
    queryKey: ["email", emailId],
    queryFn: () => emailService.getEmailById(emailId!),
    enabled: !!emailId,
  });

  const toggleStarMutation = useMutation({
    mutationFn: emailService.toggleStar,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email", emailId] });
      queryClient.invalidateQueries({ queryKey: ["emails"] });
    },
  });

  const trashMutation = useMutation({
    mutationFn: emailService.trashEmail,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      // Maybe navigate back or clear selection?
      // For now just invalidate
    },
  });

  const archiveMutation = useMutation({
    mutationFn: emailService.archiveEmail,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
    },
  });

  const markAsUnreadMutation = useMutation({
    mutationFn: emailService.markAsUnread,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email", emailId] });
      queryClient.invalidateQueries({ queryKey: ["emails"] });
    },
  });

  const handleToggleStar = () => {
    if (emailId) {
      toggleStarMutation.mutate(emailId);
      onToggleStar(emailId);
    }
  };

  const handleTrash = () => {
    if (emailId) {
      trashMutation.mutate(emailId);
    }
  };

  const handleArchive = () => {
    if (emailId) {
      archiveMutation.mutate(emailId);
    }
  };

  const handleForward = () => {
    if (email && onForward) {
      onForward(email);
    }
  };

  const handleDownloadAttachment = (attachmentId: string, filename: string) => {
    if (!emailId) return;

    // Construct download URL
    const token = getAccessToken();
    const url = `${API_BASE_URL}/emails/${emailId}/attachments/${attachmentId}?token=${token}`;

    // Trigger download
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleMarkAsUnread = () => {
    if (emailId) {
      markAsUnreadMutation.mutate(emailId);
    }
  };

  if (!emailId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 bg-gray-900">
        <div className="text-center">
          <Mail className="h-20 w-20 mx-auto mb-4 text-gray-600" />
          <p className="text-lg font-medium text-gray-300 mb-2">
            Select an email to read
          </p>
          <p className="text-sm text-gray-500">Nothing is selected.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full h-full bg-gray-900 p-6">
        <div className="space-y-4">
          <div className="h-8 bg-gray-800 animate-pulse rounded w-3/4" />
          <div className="h-4 bg-gray-800 animate-pulse rounded w-1/2" />
          <div className="h-32 bg-gray-800 animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 bg-gray-900">
        <div className="text-center">
          <Mail className="h-20 w-20 mx-auto mb-4 text-gray-600" />
          <p className="text-lg font-medium text-gray-300">Email not found</p>
        </div>
      </div>
    );
  }

  const getTimeDisplay = (date: string) => {
    const emailDate = new Date(date);
    const now = new Date();
    const diffInHours =
      (now.getTime() - emailDate.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return `Today, ${format(emailDate, "h:mm a")}`;
    } else if (diffInHours < 48) {
      return `Yesterday, ${format(emailDate, "h:mm a")}`;
    } else {
      return format(emailDate, "MMM d, h:mm a");
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) {
      return ImageIcon;
    }
    return FileText;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="w-full h-full flex flex-col bg-gray-900 text-white">
      {/* Toolbar */}
      <div className="p-4 border-b border-gray-700 bg-gray-800 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-300 hover:text-white hover:bg-gray-700"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-300 hover:text-white hover:bg-gray-700"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-300 hover:text-white hover:bg-gray-700"
          onClick={() => onToggleStar(email.id)}
          title={email.is_starred ? "Unstar" : "Star"}
        >
          {email.is_starred ? (
            <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
          ) : (
            <Star className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-300 hover:text-white hover:bg-gray-700"
        >
          <Reply className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-300 hover:text-white hover:bg-gray-700"
        >
          <ReplyAll className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-300 hover:text-white hover:bg-gray-700"
          onClick={handleForward}
          title="Forward"
        >
          <Forward className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-300 hover:text-white hover:bg-gray-700"
          onClick={handleArchive}
          title="Archive"
        >
          <Archive className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-300 hover:text-white hover:bg-gray-700"
          onClick={handleTrash}
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-300 hover:text-white hover:bg-gray-700"
          onClick={handleMarkAsUnread}
          title="Mark as unread"
        >
          <Mail className="h-4 w-4" />
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-300 hover:text-white hover:bg-gray-700"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </div>

      {/* Email Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Subject */}
        <h1 className="text-2xl font-bold text-white mb-6">{email.subject}</h1>

        {/* Header */}
        <div className="flex items-start gap-4 mb-6 pb-6 border-b border-gray-700">
          <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-semibold text-sm">
              {(email.from_name || email.from).charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-white font-medium">
                  {email.from_name || email.from}
                </p>
                <p className="text-sm text-gray-400">
                  To: Me
                  {email.to.length > 1
                    ? `, ${email.to.slice(1).join(", ")}`
                    : ""}
                </p>
              </div>
              <span className="text-sm text-gray-400 flex-shrink-0 ml-4">
                {getTimeDisplay(email.received_at)}
              </span>
            </div>
          </div>
        </div>

        {/* Attachments */}
        {email.attachments && email.attachments.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">
              Attachments
            </h3>
            <div className="space-y-2">
              {email.attachments.map((attachment) => {
                const Icon = getFileIcon(attachment.mime_type);
                return (
                  <div
                    key={attachment.id}
                    className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-white">{attachment.name}</p>
                        <p className="text-xs text-gray-400">
                          {formatFileSize(attachment.size)}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gray-400 hover:text-white hover:bg-gray-700"
                      onClick={() =>
                        handleDownloadAttachment(attachment.id, attachment.name)
                      }
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Email Body */}
        <div className="prose prose-invert max-w-none bg-white rounded-md p-4 text-black">
          {email.is_html ? (
            <iframe
              srcDoc={email.body}
              title="Email Content"
              className="w-full min-h-[400px] border-none"
              sandbox="allow-same-origin"
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-gray-800">
              {email.body}
            </pre>
          )}
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="p-4 border-t border-gray-700 bg-gray-800 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggleStar}
          disabled={toggleStarMutation.isPending}
          className="text-gray-300 hover:text-white hover:bg-gray-700"
        >
          {email.is_starred ? (
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
          ) : (
            <StarOff className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-300 hover:text-white hover:bg-gray-700"
        >
          <Reply className="h-4 w-4 mr-2" />
          Reply
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-300 hover:text-white hover:bg-gray-700"
        >
          <ReplyAll className="h-4 w-4 mr-2" />
          Reply All
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-300 hover:text-white hover:bg-gray-700"
        >
          <Forward className="h-4 w-4 mr-2" />
          Forward
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-300 hover:text-white hover:bg-gray-700"
        >
          <Archive className="h-4 w-4 mr-2" />
          Archive
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-300 hover:text-white hover:bg-gray-700"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
      </div>
    </div>
  );
}
