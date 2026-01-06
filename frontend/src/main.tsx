import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { RouterProvider } from "react-router-dom";
import { store } from "./store/store";
import { router } from "./routes/routes";
import { GOOGLE_CLIENT_ID } from "./config/api";
import { Toaster } from "sonner";
import { createIDBPersister } from "./lib/query-persist";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutes stale time (fresh data preference)
      gcTime: 1000 * 60 * 60 * 24, // 24 hours garbage collection (offline cache duration)
    },
    mutations: {
      retry: 0,
    },
  },
});

const persister = createIDBPersister();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister }}
      >
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
          <RouterProvider router={router} />
          <Toaster
            position="bottom-right"
            richColors
            closeButton
            duration={3000}
          />
        </GoogleOAuthProvider>
      </PersistQueryClientProvider>
    </Provider>
  </StrictMode>
);
