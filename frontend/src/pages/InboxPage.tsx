import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { logout, setUser } from '@/store/authSlice';
import { authService } from '@/services/auth.service';
import type { Email } from '@/types/email';
import MailboxList from '@/components/inbox/MailboxList';
import EmailList from '@/components/inbox/EmailList';
import EmailDetail from '@/components/inbox/EmailDetail';
import ComposeEmail from '@/components/inbox/ComposeEmail';
import { Button } from '@/components/ui/button';
import { Bell, Settings, User, Menu } from 'lucide-react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';

export default function InboxPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const user = useAppSelector((state) => state.auth.user);
  const { mailbox, emailId } = useParams<{ mailbox?: string; emailId?: string }>();
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  // Use URL params or default to 'inbox'
  const selectedMailboxId = mailbox || 'inbox';
  const selectedEmailId = emailId || null;

  // Check authentication on mount if we have tokens
  const hasRefreshToken = !!localStorage.getItem('refresh_token');
  const { data: meData } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authService.getMe,
    retry: false,
    enabled: hasRefreshToken,
  });

  useEffect(() => {
    if (meData?.user) {
      dispatch(setUser(meData.user));
    }
  }, [meData, dispatch]);

  const logoutMutation = useMutation({
    mutationFn: authService.logout,
    onSuccess: () => {
      dispatch(logout());
      queryClient.clear();
      navigate('/login');
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleSelectMailbox = (id: string) => {
    navigate(`/${id}`);
    setMobileView('list');
  };

  const handleSelectEmail = (email: Email) => {
    navigate(`/${selectedMailboxId}/${email.id}`);
    setMobileView('detail');
  };

  const handleToggleStar = (emailId: string) => {
    queryClient.invalidateQueries({ queryKey: ['emails'] });
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden text-gray-300 hover:text-white hover:bg-gray-700"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold text-white">MailApp</h1>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-300 hover:text-white hover:bg-gray-700"
          >
            <Bell className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-300 hover:text-white hover:bg-gray-700"
          >
            <Settings className="h-5 w-5" />
          </Button>
          <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center">
            <User className="h-5 w-5 text-white" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop: 3-column layout */}
        <div className="hidden md:flex flex-1">
          {/* Column 1: Sidebar */}
          <div className="w-64 min-w-[240px] bg-gray-800 border-r border-gray-700">
            <MailboxList
              selectedMailboxId={selectedMailboxId}
              onSelectMailbox={handleSelectMailbox}
              onComposeClick={() => setIsComposeOpen(true)}
            />
          </div>

          {/* Column 2: Email List */}
          <div className="w-96 min-w-[360px] bg-gray-900 border-r border-gray-700">
            <EmailList
              mailboxId={selectedMailboxId}
              selectedEmailId={selectedEmailId}
              onSelectEmail={handleSelectEmail}
              onToggleStar={handleToggleStar}
            />
          </div>

          {/* Column 3: Email Detail */}
          <div className="flex-1 bg-gray-900">
            <EmailDetail emailId={selectedEmailId} onToggleStar={handleToggleStar} />
          </div>
        </div>

        {/* Mobile: Single column with navigation */}
        <div className="md:hidden flex-1 flex flex-col">
          {isMobileMenuOpen && (
            <div className="absolute inset-0 z-50 bg-gray-800">
              <div className="p-4 border-b border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">Mailboxes</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-300 hover:text-white"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
              <MailboxList
                selectedMailboxId={selectedMailboxId}
                onSelectMailbox={(id) => {
                  handleSelectMailbox(id);
                  setIsMobileMenuOpen(false);
                }}
                onComposeClick={() => {
                  setIsComposeOpen(true);
                  setIsMobileMenuOpen(false);
                }}
              />
            </div>
          )}

          {mobileView === 'list' && (
            <EmailList
              mailboxId={selectedMailboxId}
              selectedEmailId={selectedEmailId}
              onSelectEmail={handleSelectEmail}
              onToggleStar={handleToggleStar}
            />
          )}

          {mobileView === 'detail' && selectedEmailId && (
            <div className="flex-1 flex flex-col bg-gray-900">
              <div className="p-4 border-b border-gray-700 bg-gray-800">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-300 hover:text-white"
                  onClick={() => {
                    navigate(`/${selectedMailboxId}`);
                    setMobileView('list');
                  }}
                >
                  ← Back
                </Button>
              </div>
              <div className="flex-1 overflow-hidden">
                <EmailDetail emailId={selectedEmailId} onToggleStar={handleToggleStar} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compose Email Dialog */}
      <ComposeEmail open={isComposeOpen} onOpenChange={setIsComposeOpen} />
    </div>
  );
}
