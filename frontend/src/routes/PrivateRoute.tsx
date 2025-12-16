import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setUser, logout } from "@/store/authSlice";
import { authService } from "@/services/auth.service";
import { useQuery } from "@tanstack/react-query";
import { getAccessToken, setAccessToken } from "@/lib/api-client";
import  LoadingIcon  from "@/assets/loading.svg?react";

interface PrivateRouteProps {
    children: React.ReactNode;
}

export const PrivateRoute = ({ children }: PrivateRouteProps) => {
    const dispatch = useAppDispatch();
    const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
    const hasAccessToken = !!getAccessToken();
    const [isCheckingAuth, setIsCheckingAuth] = useState(!hasAccessToken);
    const [authFailed, setAuthFailed] = useState(false);

    // Read theme directly to avoid unused state warnings and match loading colors
    const theme: "light" | "dark" =
        typeof window !== "undefined"
            ? ((localStorage.getItem("theme") as "light" | "dark") || "light")
            : "light";

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
                // Call refresh endpoint - backend will read refresh_token from cookie
                const response = await authService.refreshToken({ refresh_token: "" });
                if (!isMounted) return;

                if (response.user) {
                    dispatch(setUser(response.user));
                }
                if (response.access_token) {
                    setAccessToken(response.access_token);
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
        const containerBg = theme === "dark" ? "bg-gray-900" : "bg-white";
        const iconColor = theme === "dark" ? "text-white" : "text-gray-800";

        return (
            <div className={`h-screen flex items-center justify-center ${containerBg}`}>
                <div className="flex flex-col items-center gap-2">
                    <LoadingIcon className={`w-10 h-10 animate-spin ${iconColor}`} aria-hidden="true" />
                    <span className={`sr-only ${iconColor}`}>Loading...</span>
                </div>
            </div>
        );
    }

    return <>{children}</>;
};