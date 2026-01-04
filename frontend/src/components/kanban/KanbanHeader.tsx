import { useNavigate } from "react-router-dom";
import KanbanToggle from "./KanbanToggle";
import AccountMenu from "@/components/common/AccountMenu";
import type { User } from "@/types/auth";

interface KanbanHeaderProps {
  user: User | null;
  onMenuClick: () => void;
}

export default function KanbanHeader({ user, onMenuClick }: KanbanHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1f2e] shadow-sm">
      {/* Mobile Menu Button */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
      >
        <span className="material-symbols-outlined text-gray-700 dark:text-gray-300">
          menu
        </span>
      </button>

      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-linear-to-br text-white from-blue-400 to-blue-500 dark:from-blue-600 dark:to-blue-700 flex items-center justify-center shadow-md">
          <span className="material-symbols-outlined text-white text-[20px]">
            mail
          </span>
        </div>
        <span className="text-xl bg-linear-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent hidden sm:inline">
          Email Client AI - Kanban
        </span>
      </div>
      <div className="flex items-center gap-2">
        <KanbanToggle isKanban={true} onToggle={() => navigate("/inbox")} />
        
        {/* Account Menu - now uses internal hook for theme/logout */}
        <AccountMenu
          user={user}
          showFullProfile={false}
        />
      </div>
    </div>
  );
}
