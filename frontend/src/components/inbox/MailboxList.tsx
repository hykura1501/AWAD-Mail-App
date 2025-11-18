import { useQuery } from '@tanstack/react-query';
import { useAppSelector } from '@/store/hooks';
import { emailService } from '@/services/email.service';
import type { Mailbox } from '@/types/email';
import { cn } from '@/lib/utils';
import {
  Inbox,
  Star,
  Send,
  FileText,
  Archive,
  Trash2,
  Pencil,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MailboxListProps {
  selectedMailboxId: string | null;
  onSelectMailbox: (id: string) => void;
  onComposeClick?: () => void;
}

const getMailboxIcon = (type: string) => {
  switch (type) {
    case 'inbox':
      return Inbox;
    case 'starred':
      return Star;
    case 'sent':
      return Send;
    case 'drafts':
      return FileText;
    case 'archive':
      return Archive;
    case 'trash':
      return Trash2;
    default:
      return Inbox;
  }
};

export default function MailboxList({ selectedMailboxId, onSelectMailbox, onComposeClick }: MailboxListProps) {
  const user = useAppSelector((state) => state.auth.user);
  const { data: mailboxes = [], isLoading } = useQuery({
    queryKey: ['mailboxes'],
    queryFn: emailService.getAllMailboxes,
  });

  if (isLoading) {
    return (
      <div className="w-full h-full bg-gray-800">
        <div className="p-4 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-gray-700 animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-gray-800">
      {/* User Profile Section */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
            <User className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.name || 'User'}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {user?.email || 'user@example.com'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Items */}
      <div className="flex-1 overflow-y-auto p-2">
        <nav className="space-y-1">
          {mailboxes.map((mailbox: Mailbox) => {
            const Icon = getMailboxIcon(mailbox.type);
            const isSelected = selectedMailboxId === mailbox.id;

            return (
              <button
                key={mailbox.id}
                onClick={() => onSelectMailbox(mailbox.id)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors',
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="font-medium text-sm">{mailbox.name}</span>
                </div>
                {mailbox.count > 0 && (
                  <span
                    className={cn(
                      'text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0',
                      isSelected
                        ? 'bg-blue-500 text-white'
                        : 'bg-yellow-500 text-gray-900'
                    )}
                  >
                    {mailbox.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Compose Button */}
      <div className="p-4 border-t border-gray-700">
        <Button
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5"
          onClick={onComposeClick}
        >
          <Pencil className="h-4 w-4 mr-2" />
          Compose New Email
        </Button>
      </div>
    </div>
  );
}
