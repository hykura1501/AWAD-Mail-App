import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAccountActions } from "@/hooks";

interface AccountMenuProps {
  /** 
   * User object. If not provided, will use user from useAccountActions hook.
   */
  user?: {
    name?: string;
    email?: string;
    avatar_url?: string;
  } | null;
  /** 
   * Theme. If not provided, will use theme from useAccountActions hook.
   */
  theme?: "light" | "dark";
  /** 
   * Theme toggle handler. If not provided, will use toggleTheme from useAccountActions hook.
   */
  onToggleTheme?: () => void;
  /** 
   * Logout handler. If not provided, will use handleLogout from useAccountActions hook.
   */
  onLogout?: () => void;
  /** Optional: navigate to tasks handler */
  onNavigateToTasks?: () => void;
  /** Optional: navigate to settings handler */
  onNavigateToSettings?: () => void;
  /** Optional: show full profile button with name/email, otherwise just avatar */
  showFullProfile?: boolean;
  /** Optional: additional menu items */
  additionalItems?: React.ReactNode;
}

interface KeyboardShortcut {
  key: string;
  action: string;
}

const defaultShortcuts: KeyboardShortcut[] = [
  { key: "j / ↓", action: "Email tiếp theo" },
  { key: "k / ↑", action: "Email trước" },
  { key: "Enter", action: "Mở email" },
  { key: "Delete", action: "Xóa email" },
  { key: "s", action: "Gắn/bỏ sao" },
  { key: "r", action: "Đã đọc/chưa đọc" },
  { key: "Esc", action: "Bỏ chọn" },
];

const DEFAULT_AVATAR = "https://lh3.googleusercontent.com/aida-public/AB6AXuDRNQSlv4je28jMHI0WjXZhE5xKv7aSQKNqKhtFzfV3noDp7AgOUk9Hz5vby11yRlctZmQJOUwfeApOcQV9Yt";

export default function AccountMenu({
  user: userProp,
  theme: themeProp,
  onToggleTheme: onToggleThemeProp,
  onLogout: onLogoutProp,
  onNavigateToTasks,
  onNavigateToSettings,
  showFullProfile = false,
  additionalItems,
}: AccountMenuProps) {
  // Get actions from hook
  const {
    user: hookUser,
    theme: hookTheme,
    toggleTheme: hookToggleTheme,
    handleLogout: hookHandleLogout,
    navigateToTasks,
    navigateToSettings,
  } = useAccountActions();

  // Use props if provided, otherwise fall back to hook values
  const user = userProp !== undefined ? userProp : hookUser;
  const theme = themeProp ?? hookTheme;
  const onToggleTheme = onToggleThemeProp ?? hookToggleTheme;
  const onLogout = onLogoutProp ?? hookHandleLogout;
  const handleNavigateToTasks = onNavigateToTasks ?? navigateToTasks;
  const handleNavigateToSettings = onNavigateToSettings ?? navigateToSettings;

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    // Check localStorage for notification preference
    const stored = localStorage.getItem('notifications_enabled');
    if (stored !== null) {
      return stored === 'true';
    }
    // Default: check if permission is already granted
    return typeof Notification !== 'undefined' && Notification.permission === 'granted';
  });
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <>
      <div className="relative" ref={menuRef}>
        {showFullProfile ? (
          // Full profile button with name and email
          <Button
            variant="ghost"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex items-center justify-between gap-2 w-full hover:bg-gray-200 dark:hover:bg-white/5 p-1.5 h-auto rounded-lg transition-colors text-left group shadow-none"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div
                className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-8 shrink-0"
                style={{
                  backgroundImage: `url("${user?.avatar_url || DEFAULT_AVATAR}")`,
                }}
              />
              <div className="flex flex-col min-w-0 items-start flex-1">
                <h1 className="text-gray-900 dark:text-white text-sm font-medium leading-normal truncate w-full">
                  {user?.name || "Email Client AI"}
                </h1>
                <p
                  className="text-gray-500 dark:text-[#9dabb9] text-xs font-normal leading-normal truncate w-full"
                  title={user?.email || "user@email.com"}
                >
                  {user?.email || "user@email.com"}
                </p>
              </div>
            </div>
            <span className="material-symbols-outlined text-gray-500 group-hover:text-gray-900 dark:group-hover:text-white transition-colors text-lg shrink-0">
              expand_more
            </span>
          </Button>
        ) : (
          // Compact avatar button
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="w-8 h-8 rounded-full overflow-hidden border-2 border-gray-200 dark:border-gray-600 hover:border-blue-400 transition-colors"
          >
            <img
              src={user?.avatar_url || DEFAULT_AVATAR}
              alt="Avatar"
              className="w-full h-full object-cover"
            />
          </button>
        )}

        {/* Dropdown Menu */}
        {isMenuOpen && (
          <div className={`absolute ${showFullProfile ? 'top-full left-0 w-full' : 'top-full right-0 w-48'} mt-1 bg-white dark:bg-[#283039] rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100`}>
            {/* Theme Toggle */}
            <Button
              variant="ghost"
              onClick={() => {
                onToggleTheme();
                setIsMenuOpen(false);
              }}
              className="w-full px-3 py-2 justify-start h-auto text-left text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2 transition-colors text-sm rounded-none"
            >
              <span className="material-symbols-outlined text-gray-500 dark:text-gray-400 text-lg [font-variation-settings:'wght'_300]">
                {theme === "dark" ? "light_mode" : "dark_mode"}
              </span>
              <span>{theme === "dark" ? "Chế độ sáng" : "Chế độ tối"}</span>
            </Button>

            {/* Notification Toggle */}
            <Button
              variant="ghost"
              onClick={async () => {
                if (!notificationsEnabled) {
                  // Try to enable notifications
                  if (typeof Notification === 'undefined') {
                    alert('Trình duyệt không hỗ trợ thông báo');
                    return;
                  }
                  if (Notification.permission === 'denied') {
                    setShowNotificationModal(true);
                    setIsMenuOpen(false);
                    return;
                  }
                  if (Notification.permission === 'default') {
                    const permission = await Notification.requestPermission();
                    if (permission === 'granted') {
                      setNotificationsEnabled(true);
                      localStorage.setItem('notifications_enabled', 'true');
                    } else {
                      setShowNotificationModal(true);
                      setIsMenuOpen(false);
                      return;
                    }
                  } else {
                    setNotificationsEnabled(true);
                    localStorage.setItem('notifications_enabled', 'true');
                  }
                } else {
                  // Disable notifications
                  setNotificationsEnabled(false);
                  localStorage.setItem('notifications_enabled', 'false');
                }
                setIsMenuOpen(false);
              }}
              className="w-full px-3 py-2 justify-between h-auto text-left text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center transition-colors text-sm rounded-none"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-gray-500 dark:text-gray-400 text-lg [font-variation-settings:'wght'_300]">
                  {notificationsEnabled ? 'notifications_active' : 'notifications_off'}
                </span>
                <span>Thông báo</span>
              </div>
              {/* Toggle Switch */}
              <div className={`relative w-9 h-5 rounded-full transition-colors ${notificationsEnabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${notificationsEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </Button>

            {/* Tasks */}
            <Button
              variant="ghost"
              onClick={() => {
                handleNavigateToTasks();
                setIsMenuOpen(false);
              }}
              className="w-full px-3 py-2 justify-start h-auto text-left text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2 transition-colors text-sm rounded-none"
            >
              <span className="material-symbols-outlined text-gray-500 dark:text-gray-400 text-lg [font-variation-settings:'wght'_300]">
                task
              </span>
              <span>Nhiệm vụ</span>
            </Button>

            {/* Keyboard Shortcuts */}
            <Button
              variant="ghost"
              onClick={() => {
                setShowShortcuts(true);
                setIsMenuOpen(false);
              }}
              className="w-full px-3 py-2 justify-start h-auto text-left text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2 transition-colors text-sm rounded-none"
            >
              <span className="material-symbols-outlined text-gray-500 dark:text-gray-400 text-lg [font-variation-settings:'wght'_300]">
                keyboard
              </span>
              <span>Phím tắt</span>
            </Button>

            {/* Settings */}
            <Button
              variant="ghost"
              onClick={() => {
                handleNavigateToSettings();
                setIsMenuOpen(false);
              }}
              className="w-full px-3 py-2 justify-start h-auto text-left text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2 transition-colors text-sm rounded-none"
            >
              <span className="material-symbols-outlined text-gray-500 dark:text-gray-400 text-lg [font-variation-settings:'wght'_300]">
                settings
              </span>
              <span>Cài đặt</span>
            </Button>

            {/* Additional custom items */}
            {additionalItems}

            {/* Separator */}
            <div className="h-px bg-gray-200 dark:bg-gray-700 mx-2" />

            {/* Logout */}
            <Button
              variant="ghost"
              onClick={() => {
                onLogout();
                setIsMenuOpen(false);
              }}
              className="w-full px-3 py-2 justify-start h-auto text-left text-red-500 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2 transition-colors text-sm rounded-none"
            >
              <span className="material-symbols-outlined text-lg [font-variation-settings:'wght'_300]">
                logout
              </span>
              <span>Đăng xuất</span>
            </Button>
          </div>
        )}
      </div>

      {/* Keyboard Shortcuts Dialog */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="max-w-[240px] p-4">
          <DialogHeader className="pb-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="material-symbols-outlined text-xl">keyboard</span>
              Phím tắt
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {defaultShortcuts.map((s) => (
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

      {/* Notification Permission Modal */}
      <Dialog open={showNotificationModal} onOpenChange={setShowNotificationModal}>
        <DialogContent className="max-w-[320px] p-5">
          <DialogHeader className="pb-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="material-symbols-outlined text-xl text-orange-500">notifications_off</span>
              Bật thông báo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Để nhận thông báo email mới, bạn cần cho phép thông báo trong cài đặt trình duyệt.
            </p>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 text-sm">
              <p className="font-medium text-gray-900 dark:text-white mb-2">Hướng dẫn:</p>
              <ol className="list-decimal list-inside space-y-1 text-gray-600 dark:text-gray-400">
                <li>Nhấn vào biểu tượng 🔒 trên thanh địa chỉ</li>
                <li>Tìm mục "Thông báo" (Notifications)</li>
                <li>Chọn "Cho phép" (Allow)</li>
                <li>Tải lại trang</li>
              </ol>
            </div>
            <Button
              onClick={() => setShowNotificationModal(false)}
              className="w-full"
            >
              Đã hiểu
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
