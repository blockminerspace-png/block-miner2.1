import { useEffect, useRef } from 'react';
import { useGameStore } from '../../store/game';

/**
 * Subscribe to real-time replies for a support ticket (user session; same Socket.IO as mining).
 */
export function useSupportTicketSocket(
  supportMessageId: number | string | null | undefined,
  onReply: (reply: unknown) => void,
) {
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

    const handleReply = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const p = payload as { supportMessageId?: unknown; reply?: unknown };
      if (
        Number(p.supportMessageId) === Number(supportMessageId) &&
        p.reply !== undefined &&
        p.reply !== null
      ) {
        onReplyRef.current?.(p.reply);
      }
    };

    sock.on('support:reply', handleReply);

    const subscribe = () => {
      sock.emit('support:subscribe', { supportMessageId }, () => {});
    };

    if (sock.connected) subscribe();
    sock.on('connect', subscribe);

    const room = `support:${supportMessageId}`;

    return () => {
      sock.off('support:reply', handleReply);
      sock.off('connect', subscribe);
      if (sock.connected) sock.leave(room);
    };
  }, [supportMessageId, socket]);
}
