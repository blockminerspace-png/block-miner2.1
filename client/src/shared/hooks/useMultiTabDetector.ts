import { useState, useEffect } from 'react';

type TabPingMessage = { type: 'PING'; id: number };
type TabPongMessage = { type: 'PONG' };

function isTabPingMessage(v: unknown): v is TabPingMessage {
  return typeof v === 'object' && v !== null && (v as { type?: unknown }).type === 'PING';
}

function isTabPongMessage(v: unknown): v is TabPongMessage {
  return typeof v === 'object' && v !== null && (v as { type?: unknown }).type === 'PONG';
}

/**
 * Hook to detect if multiple tabs of the same page/feature are open.
 * Uses BroadcastChannel API for real-time tab communication.
 *
 * @param channelName Unique name for the feature (e.g., 'auto-mining', 'youtube')
 * @returns isDuplicate Returns true if another tab with the same channel name is already open.
 */
export function useMultiTabDetector(channelName: string) {
    const [isDuplicate, setIsDuplicate] = useState(false);

    useEffect(() => {
        const channel = new BroadcastChannel(`tab_check_${channelName}`);

        channel.postMessage({ type: 'PING', id: Date.now() } satisfies TabPingMessage);

        const handleMessage = (event: MessageEvent<unknown>) => {
            const data = event.data;
            if (isTabPingMessage(data)) {
                channel.postMessage({ type: 'PONG' } satisfies TabPongMessage);
            } else if (isTabPongMessage(data)) {
                setIsDuplicate(true);
            }
        };

        channel.onmessage = handleMessage;

        return () => {
            channel.close();
        };
    }, [channelName]);

    return isDuplicate;
}
