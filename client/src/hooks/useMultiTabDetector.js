import { useState, useEffect } from 'react';

/**
 * Hook to detect if multiple tabs of the same page/feature are open.
 * Uses BroadcastChannel API for real-time tab communication.
 * 
 * @param {string} channelName Unique name for the feature (e.g., 'auto-mining', 'youtube')
 * @returns {boolean} isDuplicate Returns true if another tab with the same channel name is already open.
 */
export function useMultiTabDetector(channelName) {
    const [isDuplicate, setIsDuplicate] = useState(false);

    useEffect(() => {
        const channel = new BroadcastChannel(`tab_check_${channelName}`);
        
        // When this tab opens, broadcast a "ping" to see if others exist
        channel.postMessage({ type: 'PING', id: Date.now() });

        const handleMessage = (event) => {
            if (event.data.type === 'PING') {
                // Another tab just opened, tell them we are already here
                channel.postMessage({ type: 'PONG' });
            } else if (event.data.type === 'PONG') {
                // We received a response, meaning another tab is already open
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
