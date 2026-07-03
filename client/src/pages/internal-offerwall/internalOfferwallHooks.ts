import { useEffect, useMemo, useRef, useState } from 'react';

export function useDecountingSeconds(serverSeconds: number | null | undefined): number | null {
  const [v, setV] = useState<number | null>(serverSeconds ?? null);
  useEffect(() => {
    setV(serverSeconds ?? null);
  }, [serverSeconds]);
  useEffect(() => {
    if (v == null || v <= 0) return undefined;
    const id = setInterval(() => setV((x) => (x != null && x > 0 ? x - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [v, serverSeconds]);
  return v;
}

export function useElapsedSeconds(startedAtIso: string, active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [startedAtIso, active]);
  return useMemo(() => {
    if (!active) return 0;
    try {
      const started = new Date(startedAtIso).getTime();
      return Math.max(0, (Date.now() - started) / 1000);
    } catch {
      return 0;
    }
  }, [startedAtIso, active, tick]);
}

/**
 * Machine states: IDLE → OPENING_AD → VIEWING ↔ PAUSED → COMPLETED / CANCELLED
 *
 * Acumula tempo APENAS enquanto o BlockMiner não está com foco (usuário está no site do
 * anunciante). Quando o usuário retorna, o timer pausa. Quando sai novamente, continua
 * do ponto onde parou. Usa Page Visibility API + blur/focus — nenhum clique é interceptado.
 *
 * Returns: { elapsed: segundos acumulados reais de visualização, isPaused: true quando o
 * usuário está no BlockMiner e o timer está em espera }
 */
export function useActiveViewSeconds(
  startedAtIso: string | null | undefined,
  active: boolean,
): { elapsed: number; isPaused: boolean } {
  // Tempo acumulado enquanto usuário estava ausente (em ms)
  const [accumulatedMs, setAccumulatedMs] = useState(0);
  // Timestamp de quando o usuário saiu do BlockMiner (null = está aqui agora)
  const viewingStartRef = useRef<number | null>(null);
  // isViewing state para re-render quando muda
  const [isViewing, setIsViewing] = useState(false);
  const [tick, setTick] = useState(0);

  // Reset completo quando a tentativa muda
  useEffect(() => {
    setAccumulatedMs(0);
    viewingStartRef.current = null;
    setIsViewing(false);
  }, [startedAtIso]);

  useEffect(() => {
    if (!active) {
      // Timer desativado: flush qualquer tempo pendente e para
      if (viewingStartRef.current != null) {
        const delta = Date.now() - viewingStartRef.current;
        setAccumulatedMs((prev) => prev + delta);
        viewingStartRef.current = null;
        setIsViewing(false);
      }
      return undefined;
    }

    // Quando o timer ativa, verifica se já está fora do foco
    // (ex: aba do anunciante foi aberta antes deste effect rodar)
    if (!document.hasFocus() || document.hidden) {
      if (viewingStartRef.current == null) {
        viewingStartRef.current = Date.now();
        setIsViewing(true);
      }
    }

    const startViewing = () => {
      if (viewingStartRef.current == null) {
        viewingStartRef.current = Date.now();
        setIsViewing(true);
      }
    };

    const pauseViewing = () => {
      if (viewingStartRef.current != null) {
        const delta = Date.now() - viewingStartRef.current;
        setAccumulatedMs((prev) => prev + delta);
        viewingStartRef.current = null;
        setIsViewing(false);
      }
    };

    const onBlur = () => startViewing();
    const onFocus = () => pauseViewing();
    const onVisibilityChange = () => {
      if (document.hidden) startViewing();
      else pauseViewing();
    };

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    const id = setInterval(() => setTick((x) => x + 1), 1000);

    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(id);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, startedAtIso]);

  const elapsed = useMemo(() => {
    if (!active) return 0;
    const current = viewingStartRef.current != null ? Date.now() - viewingStartRef.current : 0;
    return (accumulatedMs + current) / 1000;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, accumulatedMs, tick]);

  return { elapsed, isPaused: active && !isViewing };
}
