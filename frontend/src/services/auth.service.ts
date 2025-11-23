import apiClient from "@/lib/api-client";
import { setAccessToken } from "@/lib/api-client";
import type {
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  GoogleSignInRequest,
  RefreshTokenRequest,
  User,
} from "@/types/auth";

export const authService = {
  login: async (data: LoginRequest): Promise<TokenResponse> => {
    const response = await apiClient.post<TokenResponse>("/auth/login", data);
    setAccessToken(response.data.access_token);
    return response.data;
  },

  register: async (data: RegisterRequest): Promise<TokenResponse> => {
    const response = await apiClient.post<TokenResponse>(
      "/auth/register",
      data
    );
    setAccessToken(response.data.access_token);
    return response.data;
  },

  googleSignIn: async (data: GoogleSignInRequest): Promise<TokenResponse> => {
    const response = await apiClient.post<TokenResponse>("/auth/google", data);
    setAccessToken(response.data.access_token);
    return response.data;
  },

  refreshToken: async (data: RefreshTokenRequest): Promise<TokenResponse> => {
    const response = await apiClient.post<TokenResponse>("/auth/refresh", data);
    setAccessToken(response.data.access_token);
    return response.data;
  },

  getMe: async (): Promise<{ user: User }> => {
    const response = await apiClient.get<{ user: User }>("/auth/me");
    return { user: response.data.user };
  },

  logout: async (): Promise<void> => {
    try {
      await apiClient.post("/auth/logout", {});
    } finally {
      setAccessToken(null);
      const channel = new BroadcastChannel("auth_channel");
      channel.postMessage({ type: "LOGOUT" });
      channel.close();
    }
  },
};
