import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { RouterProvider } from "react-router-dom";
import { store } from "./store/store";
import { router } from "./routes/routes";
import { GOOGLE_CLIENT_ID } from "./config/api";
import { Toaster } from "sonner";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000, // 30 seconds
    },
    mutations: {
      retry: 0,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
          <RouterProvider router={router} />
          <Toaster 
            position="bottom-right" 
            richColors 
            closeButton 
            duration={3000}
          />
        </GoogleOAuthProvider>
      </QueryClientProvider>
    </Provider>
  </StrictMode>
);
