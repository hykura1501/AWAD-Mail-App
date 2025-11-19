import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setUser } from '@/store/authSlice';
import { authService } from '@/services/auth.service';
import { useQuery } from '@tanstack/react-query';
import { getAccessToken, setAccessToken, setRefreshToken } from '@/lib/api-client';

interface PrivateRouteProps {
  children: React.ReactNode;
}

export const PrivateRoute = ({ children }: PrivateRouteProps) => {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const hasAccessToken = !!getAccessToken();
  const hasRefreshToken = !!localStorage.getItem('refresh_token');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [canFetchProfile, setCanFetchProfile] = useState(hasAccessToken);

  useEffect(() => {
    let isMounted = true;

    const attemptRefresh = async () => {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        if (isMounted) {
          setRefreshFailed(true);
          setIsRefreshing(false);
        }
        return;
      }

      try {
        setIsRefreshing(true);
        const response = await authService.refreshToken({ refresh_token: refreshToken });
        if (!isMounted) return;
        dispatch(setUser(response.user));
        setCanFetchProfile(true);
      } catch {
        if (!isMounted) return;
        setAccessToken(null);
        setRefreshToken(null);
        setRefreshFailed(true);
      } finally {
        if (isMounted) {
          setIsRefreshing(false);
        }
      }
    };

    if (!hasAccessToken && hasRefreshToken) {
      attemptRefresh();
    } else {
      setCanFetchProfile(hasAccessToken);
    }

    return () => {
      isMounted = false;
    };
  }, [hasAccessToken, hasRefreshToken, dispatch]);

  // Check authentication status
  const { data, isLoading, isError } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authService.getMe,
    retry: false,
    enabled: canFetchProfile,
  });

  useEffect(() => {
    if (data?.user) {
      dispatch(setUser(data.user));
    }
  }, [data, dispatch]);

  // If no tokens at all, redirect immediately
  if ((!hasRefreshToken && !hasAccessToken) || refreshFailed) {
    return <Navigate to="/login" replace />;
  }

  if (!canFetchProfile || isRefreshing || (canFetchProfile && isLoading)) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  // If error or no user data, redirect to login
  if (isError || (!data?.user && !isAuthenticated)) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
