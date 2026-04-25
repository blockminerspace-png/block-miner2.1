import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/game';

/**
 * Subscribe to real-time replies for a support ticket (user session; same Socket.IO as mining).
 * @param {number | null | undefined} supportMessageId
 * @param {(reply: object) => void} onReply
 */
export function useSupportTicketSocket(supportMessageId, onReply) {
  const initSocket = useGameStore((s) => s.initSocket);
  const socket = useGameStore((s) => s.socket);
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;

  useEffect(() => {
    initSocket();
  }, [initSocket]);

  useEffect(() => {
    if (!supportMessageId) return;

    const sock = useGameStore.getState().socket;
    if (!sock) return;

    const handleReply = (payload) => {
      if (
        payload &&
        Number(payload.supportMessageId) === Number(supportMessageId) &&
        payload.reply
      ) {
        onReplyRef.current?.(payload.reply);
      }
    };

    sock.on('support:reply', handleReply);

    const subscribe = () => {
      sock.emit('support:subscribe', { supportMessageId }, () => {});
    };

    if (sock.connected) subscribe();
    else sock.once('connect', subscribe);

    return () => {
      sock.off('support:reply', handleReply);
    };
  }, [supportMessageId, socket]);
}
