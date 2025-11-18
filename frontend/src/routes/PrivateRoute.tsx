import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setUser } from '@/store/authSlice';
import { authService } from '@/services/auth.service';
import { useQuery } from '@tanstack/react-query';
import { getAccessToken, setAccessToken } from '@/lib/api-client';

interface PrivateRouteProps {
  children: React.ReactNode;
}

export const PrivateRoute = ({ children }: PrivateRouteProps) => {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const hasAccessToken = !!getAccessToken();
  const hasRefreshToken = !!localStorage.getItem('refresh_token');

  // If we have refresh token but no access token, try to refresh first
  const shouldRefresh = hasRefreshToken && !hasAccessToken;

  // Try to refresh token if needed
  const { data: refreshData } = useQuery({
    queryKey: ['auth', 'refresh'],
    queryFn: async () => {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) throw new Error('No refresh token');
      return authService.refreshToken({ refresh_token: refreshToken });
    },
    retry: false,
    enabled: shouldRefresh,
  });

  useEffect(() => {
    if (refreshData) {
      setAccessToken(refreshData.access_token);
      // Refresh token is already updated in authService
    }
  }, [refreshData]);

  // Check authentication status
  const { data, isLoading, isError } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authService.getMe,
    retry: false,
    enabled: hasAccessToken || !!refreshData, // Wait for refresh if needed
  });

  useEffect(() => {
    if (data?.user) {
      dispatch(setUser(data.user));
    }
  }, [data, dispatch]);

  // If no tokens at all, redirect immediately
  if (!hasRefreshToken && !hasAccessToken) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading || shouldRefresh) {
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
