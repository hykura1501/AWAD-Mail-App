import apiClient from "@/lib/api-client";

export const fcmService = {
  registerToken: async (token: string, deviceInfo: string = navigator.userAgent): Promise<void> => {
    await apiClient.post("/fcm/register", { token, device_info: deviceInfo });
  },

  unregisterToken: async (token: string): Promise<void> => {
    await apiClient.delete(`/fcm/${encodeURIComponent(token)}`);
  },
};
