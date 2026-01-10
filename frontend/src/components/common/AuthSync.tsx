import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAppDispatch } from "@/store/hooks";
import { logout } from "@/store/authSlice";

const AUTH_CHANNEL_NAME = "auth_sync_channel";

export default function AuthSync() {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    useEffect(() => {
        const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);

        channel.onmessage = (event) => {
            if (event.data.type === "LOGOUT") {
                // Perform local logout only (no API call)
                dispatch(logout());
                queryClient.clear();
                navigate("/login");
            }
        };

        return () => {
            channel.close();
        };
    }, [dispatch, navigate, queryClient]);

    return null;
}
