import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setUser, logout } from "@/store/authSlice";
import { authService } from "@/services/auth.service";
import { useQuery } from "@tanstack/react-query";
import { getAccessToken, setAccessToken } from "@/lib/api-client";

interface PrivateRouteProps {
  children: React.ReactNode;
}

export const PrivateRoute = ({ children }: PrivateRouteProps) => {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const hasAccessToken = !!getAccessToken();
  const [isCheckingAuth, setIsCheckingAuth] = useState(!hasAccessToken);
  const [authFailed, setAuthFailed] = useState(false);

  // Listen for logout
  useEffect(() => {
    const channel = new BroadcastChannel("auth_channel");
    channel.onmessage = (event) => {
      if (event.data.type === "LOGOUT") {
        dispatch(logout());
        setAccessToken(null);
        window.location.href = "/login";
      }
    };
    return () => channel.close();
  }, [dispatch]);

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      if (hasAccessToken) {
        setIsCheckingAuth(false);
        return;
      }

      try {
        const response = await authService.refreshToken({ refresh_token: "" });
        if (!isMounted) return;

        if (response.user) {
          dispatch(setUser(response.user));
        }
      } catch {
        if (!isMounted) return;
        setAccessToken(null);
        setAuthFailed(true);
      } finally {
        if (isMounted) {
          setIsCheckingAuth(false);
        }
      }
    };

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [dispatch, hasAccessToken]);

  const { data: meData, isError: meError } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: authService.getMe,
    retry: false,
    enabled: !!getAccessToken() && !isAuthenticated,
  });

  useEffect(() => {
    if (meData?.user) {
      dispatch(setUser(meData.user));
    }
  }, [meData, dispatch]);

  if (authFailed || (meError && !isCheckingAuth)) {
    return <Navigate to="/login" replace />;
  }

  if (isCheckingAuth) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
};
