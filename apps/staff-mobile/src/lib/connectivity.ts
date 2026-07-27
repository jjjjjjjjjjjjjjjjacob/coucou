import { useConvex } from "convex/react";
import { useEffect, useState } from "react";

export function useConvexConnection(): boolean {
  const convexClient = useConvex();
  const [isConnected, setIsConnected] = useState(
    convexClient.connectionState().isWebSocketConnected,
  );

  useEffect(
    () =>
      convexClient.subscribeToConnectionState((connectionState) => {
        setIsConnected(connectionState.isWebSocketConnected);
      }),
    [convexClient],
  );

  return isConnected;
}
