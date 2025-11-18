import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { emailService } from '@/services/email.service';
import type { Email } from '@/types/email';
import { cn } from '@/lib/utils';
import {
  Star,
  StarOff,
  Mail,
  Search,
  CheckSquare,
  RefreshCw,
  Mail as MailIcon,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';

interface EmailListProps {
  mailboxId: string | null;
  selectedEmailId: string | null;
  onSelectEmail: (email: Email) => void;
  onToggleStar: (emailId: string) => void;
}

const ITEMS_PER_PAGE = 20;

export default function EmailList({
  mailboxId,
  selectedEmailId,
  onSelectEmail,
  onToggleStar,
}: EmailListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  const { data, isLoading } = useQuery({
    queryKey: ['emails', mailboxId, offset],
    queryFn: () => emailService.getEmailsByMailbox(mailboxId!, ITEMS_PER_PAGE, offset),
    enabled: !!mailboxId,
  });

  const emails = data?.emails || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const filteredEmails = emails.filter(
    (email) =>
      email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.from_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.preview.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Reset to page 1 when mailbox changes
  useEffect(() => {
    setCurrentPage(1);
  }, [mailboxId]);

  if (!mailboxId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 bg-gray-900">
        <div className="text-center">
          <Mail className="h-16 w-16 mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400">Select a mailbox to view emails</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full h-full bg-gray-900">
        <div className="p-4 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-gray-800 animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 bg-gray-900">
        <div className="text-center">
          <Mail className="h-16 w-16 mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400">No emails in this mailbox</p>
        </div>
      </div>
    );
  }

  const getTimeDisplay = (date: string) => {
    const emailDate = new Date(date);
    const now = new Date();
    const diffInHours = (now.getTime() - emailDate.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return format(emailDate, 'h:mm a');
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return format(emailDate, 'MMM d');
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">Inbox</h2>

        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search mail"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded">
            <CheckSquare className="h-4 w-4" />
          </button>
          <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded">
            <MailIcon className="h-4 w-4" />
          </button>
          <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Email List */}
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-gray-800">
          {filteredEmails.map((email: Email) => {
            const isSelected = selectedEmailId === email.id;

            return (
              <div
                key={email.id}
                onClick={() => onSelectEmail(email)}
                className={cn(
                  'w-full text-left p-4 transition-colors cursor-pointer',
                  isSelected
                    ? 'bg-blue-600/20 border-l-4 border-l-blue-500'
                    : 'hover:bg-gray-800',
                  !email.is_read && 'bg-gray-800/50'
                )}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 h-4 w-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
                  />
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStar(email.id);
                    }}
                    className="mt-0.5 flex-shrink-0 cursor-pointer"
                  >
                    {email.is_starred ? (
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ) : (
                      <StarOff className="h-4 w-4 text-gray-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={cn(
                          'text-sm font-medium truncate',
                          isSelected ? 'text-white' : 'text-gray-300',
                          !email.is_read && 'font-semibold'
                        )}
                      >
                        {email.from_name || email.from}
                      </span>
                      <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                        {getTimeDisplay(email.received_at)}
                      </span>
                    </div>
                    <div
                      className={cn(
                        'text-sm mb-1 truncate',
                        isSelected ? 'text-white' : 'text-gray-400',
                        !email.is_read && 'font-medium'
                      )}
                    >
                      {email.subject}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{email.preview}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pagination */}
      <div className="p-4 border-t border-gray-700 flex items-center justify-between text-sm text-gray-400 bg-gray-800">
        <span>
          Showing {offset + 1}-{Math.min(offset + ITEMS_PER_PAGE, total)} of {total}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className={cn(
              'p-1 rounded',
              currentPage === 1
                ? 'text-gray-600 cursor-not-allowed'
                : 'hover:text-white hover:bg-gray-700 text-gray-400'
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className={cn(
              'p-1 rounded',
              currentPage >= totalPages
                ? 'text-gray-600 cursor-not-allowed'
                : 'hover:text-white hover:bg-gray-700 text-gray-400'
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
