import apiClient from '@/lib/api-client';
import { setAccessToken, setRefreshToken } from '@/lib/api-client';
import type {
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  GoogleSignInRequest,
  RefreshTokenRequest,
  User,
} from '@/types/auth';

export const authService = {
  login: async (data: LoginRequest): Promise<TokenResponse> => {
    const response = await apiClient.post<TokenResponse>('/auth/login', data);
    setAccessToken(response.data.access_token);
    setRefreshToken(response.data.refresh_token);
    return response.data;
  },

  register: async (data: RegisterRequest): Promise<TokenResponse> => {
    const response = await apiClient.post<TokenResponse>('/auth/register', data);
    setAccessToken(response.data.access_token);
    setRefreshToken(response.data.refresh_token);
    return response.data;
  },

  googleSignIn: async (data: GoogleSignInRequest): Promise<TokenResponse> => {
    const response = await apiClient.post<TokenResponse>('/auth/google', data);
    setAccessToken(response.data.access_token);
    setRefreshToken(response.data.refresh_token);
    return response.data;
  },

  refreshToken: async (data: RefreshTokenRequest): Promise<TokenResponse> => {
    const response = await apiClient.post<TokenResponse>('/auth/refresh', data);
    setAccessToken(response.data.access_token);
    setRefreshToken(response.data.refresh_token);
    return response.data;
  },

  getMe: async (): Promise<{ user: User }> => {
    const response = await apiClient.get<{ user: User }>('/auth/me');
    return { user: response.data.user };
  },

  logout: async (): Promise<void> => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      try {
        await apiClient.post('/auth/logout', { refresh_token: refreshToken });
      } catch (error) {
        // Continue with logout even if API call fails
        console.error('Logout API call failed:', error);
      }
    }
    setAccessToken(null);
    setRefreshToken(null);
  },
};
