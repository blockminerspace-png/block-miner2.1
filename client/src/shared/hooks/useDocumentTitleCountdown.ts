import { useEffect, useRef } from 'react';

/**
 * Controla document.title com contador regressivo durante atividades patrocinadas.
 *
 * - Ativo:    "(30s) Nome — BlockMiner"
 * - Pausado:  "⏸ (30s) Nome — BlockMiner"
 * - Pronto:   "✅ Recompensa Liberada — BlockMiner" → restaura após 5s
 * - Inativo:  restaura o título original imediatamente
 *
 * Nenhuma regra de negócio aqui — apenas feedback visual via document.title.
 */
export function useDocumentTitleCountdown({
  remainingSeconds,
  isPaused = false,
  isActive,
  isComplete,
  pageName,
}: {
  remainingSeconds: number;
  isPaused?: boolean;
  isActive: boolean;
  isComplete: boolean;
  pageName: string;
}) {
  const baseTitle = useRef('BlockMiner');

  // Captura o título original antes de qualquer modificação
  useEffect(() => {
    const current = document.title;
    if (!current.startsWith('(') && !current.startsWith('⏸') && !current.startsWith('✅')) {
      baseTitle.current = current;
    }
  }, []);

  useEffect(() => {
    if (isComplete) {
      document.title = '✅ Recompensa Liberada — BlockMiner';
      const t = setTimeout(() => {
        document.title = baseTitle.current;
      }, 5000);
      return () => {
        clearTimeout(t);
        document.title = baseTitle.current;
      };
    }

    if (!isActive) {
      document.title = baseTitle.current;
      return;
    }

    const s = Math.max(0, Math.ceil(remainingSeconds));
    document.title = isPaused
      ? `⏸ (${s}s) ${pageName} — BlockMiner`
      : `(${s}s) ${pageName} — BlockMiner`;

    return () => {
      document.title = baseTitle.current;
    };
  }, [remainingSeconds, isPaused, isActive, isComplete, pageName]);

  // Garante restauração ao desmontar o componente (troca de rota, cancelamento)
  useEffect(() => {
    return () => {
      document.title = baseTitle.current;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
