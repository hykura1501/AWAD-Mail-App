import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { logout } from "@/store/authSlice";
import { authService } from "@/services/auth.service";
import { useTheme } from "./useTheme";

/**
 * Custom hook that encapsulates all account-related actions.
 * This centralizes logic that was previously duplicated across pages.
 * 
 * @example
 * ```tsx
 * const { user, theme, toggleTheme, handleLogout, isLoggingOut } = useAccountActions();
 * 
 * return (
 *   <AccountMenu
 *     user={user}
 *     theme={theme}
 *     onToggleTheme={toggleTheme}
 *     onLogout={handleLogout}
 *   />
 * );
 * ```
 */
export function useAccountActions() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const user = useAppSelector((state) => state.auth.user);

  // Theme management from useTheme hook
  const { theme, toggleTheme, isDark } = useTheme();

  // Logout mutation with proper cleanup
  const logoutMutation = useMutation({
    mutationFn: authService.logout,
    onSuccess: () => {
      dispatch(logout());
      const channel = new BroadcastChannel("auth_sync_channel");
      channel.postMessage({ type: "LOGOUT" });
      setTimeout(() => channel.close(), 100);
      queryClient.clear();
      navigate("/login");
    },
  });

  const handleLogout = useCallback(() => {
    logoutMutation.mutate();
  }, [logoutMutation]);

  // Navigation helpers
  const navigateToTasks = useCallback(() => {
    navigate("/tasks");
  }, [navigate]);

  const navigateToSettings = useCallback(() => {
    // TODO: Navigate to settings when settings page is implemented
    navigate("/settings");
  }, [navigate]);

  const navigateToInbox = useCallback(() => {
    navigate("/inbox");
  }, [navigate]);

  const navigateToKanban = useCallback(() => {
    navigate("/kanban");
  }, [navigate]);

  return {
    // User state
    user,

    // Theme
    theme,
    toggleTheme,
    isDark,

    // Logout
    handleLogout,
    isLoggingOut: logoutMutation.isPending,

    // Navigation
    navigateToTasks,
    navigateToSettings,
    navigateToInbox,
    navigateToKanban,
  };
}

export default useAccountActions;
