import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL } from "@/config/api";

// Token storage (in-memory for access token)
let accessToken: string | null = null;
let refreshPromise: Promise<string> | null = null;

export const setAccessToken = (token: string | null) => {
    accessToken = token;
};

export const getAccessToken = () => accessToken;

// Create axios instance
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    headers: {
        "Content-Type": "application/json",
    },
});

// Request interceptor to add access token
apiClient.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const token = getAccessToken();
        if (token && config.headers) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Function to refresh token
// Uses cookie-based refresh token (withCredentials: true)
const refreshAccessToken = async (): Promise<string> => {
    try {
        // Backend reads refresh_token from cookie automatically
        const response = await axios.post<{ access_token: string }>(
            `${API_BASE_URL}/auth/refresh`,
            {},
            { 
                withCredentials: true,
                // Don't retry refresh endpoint itself
                validateStatus: (status) => status < 500
            }
        );

        if (response.status !== 200 || !response.data.access_token) {
            throw new Error("Failed to refresh token");
        }

        const newAccessToken = response.data.access_token;
        setAccessToken(newAccessToken);
        return newAccessToken;
    } catch (error) {
        setAccessToken(null);
        throw error;
    }
};

// Response interceptor
apiClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & {
            _retry?: boolean;
        };

        const isAuthEndpoint =
            originalRequest.url?.includes("/auth/login") ||
            originalRequest.url?.includes("/auth/register") ||
            originalRequest.url?.includes("/auth/refresh") ||
            originalRequest.url?.includes("/auth/logout") ||
            originalRequest.url?.includes("/auth/google");

        // CASE 1: Handle refresh-token logic for 401 errors
        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !isAuthEndpoint
        ) {
            originalRequest._retry = true;

            // Use existing refresh promise if one is in progress (prevents multiple concurrent refreshes)
            if (!refreshPromise) {
                refreshPromise = refreshAccessToken();
            }

            try {
                const newAccessToken = await refreshPromise;
                // Clear promise after successful refresh
                refreshPromise = null;

                // Retry original request with new token
                if (originalRequest.headers) {
                    originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                }

                return apiClient(originalRequest);
            } catch (refreshError) {
                // Clear promise on error
                refreshPromise = null;
                setAccessToken(null);
                
                // Only redirect if it's not already a refresh request
                if (!originalRequest.url?.includes("/auth/refresh")) {
                    window.location.href = "/login";
                }
                return Promise.reject(refreshError);
            }
        }

        // CASE 2: If refresh failed or token is invalid, redirect to login
        if (error.response?.status === 401 && !isAuthEndpoint && originalRequest._retry) {
            setAccessToken(null);
            if (!originalRequest.url?.includes("/auth/refresh")) {
                window.location.href = "/login";
            }
        }

        return Promise.reject(error);
    }
);

export default apiClient;
