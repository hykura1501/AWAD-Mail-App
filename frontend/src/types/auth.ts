export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  provider: string;
  created_at: string;
  updated_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface AuthResponse {
  user: User;
  message: string;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface GoogleSignInRequest {
  token: string;
}

