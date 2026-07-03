/**
 * Classificação de erros de cliente que são 100% ruído — não são do nosso código
 * e não dá pra consertar. São silenciados antes de chegar ao painel admin
 * (`/api/track/client-error`) para não lotar a lista de "Erros de cliente".
 *
 * Causas típicas:
 *  - Scripts de terceiros bloqueados por adblock / rede / DNS (YouTube, ads, GA...).
 *  - Extensões de tradução (Yandex/Aloha/Google) injetando widgets.
 *  - Extensões de carteira (MetaMask, Rabby, etc.) a disputar window.ethereum.
 *  - Tradução nativa de navegadores (Yandex/Aloha) reescrevendo nós de texto que
 *    o React gerencia → "insertBefore: not a child of this node" / "removeChild".
 *    O app já marca tudo com translate="no"/notranslate, mas esses navegadores
 *    ignoram o hint; o crash resultante é incontrolável do nosso lado.
 */

/** Mensagens/URLs de scripts de terceiros bloqueados — casam contra message/stack. */
export const THIRD_PART_SCRIPT_NOISE: readonly RegExp[] = [
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-extension:\/\//i,
  /\bblob:https?:\/\//i,
  // Ad / analytics / tracking networks
  /ss\.mrmnd\.com/i,
  /infird\.com/i,
  /googletagmanager\.com/i,
  /google-analytics\.com/i,
  /googlesyndication\.com/i,
  /pagead2\.googlesyndication\.com/i,
  /adsbygoogle/i,
  /doubleclick\.net/i,
  /facebook\.net/i,
  /metapixel/i,
  // APIs de terceiros frequentemente bloqueadas por adblock / DNS regional
  /youtube\.com\/iframe_api/i,
  /translate\.google\.com/i,
  /ytimg\.com/i,
  // Wallet browser extensions (inpage.js / contentscript.js — not our bundle)
  /inpage\.js/i,
  /contentscript\.js/i,
  /ObjectMultiplex/i,
  /MaxListenersExceededWarning/i,
  /global Ethereum provider/i,
  /which has only a getter/i,
];

/** Wallet-extension console noise — message-only patterns. */
export const WALLET_EXTENSION_NOISE: readonly RegExp[] = [
  /MetaMask encountered an error setting the global Ethereum provider/i,
  /another Ethereum wallet extension/i,
  /ObjectMultiplex - orphaned data/i,
  /ObjectMultiplex - malformed chunk/i,
];

/**
 * Erros de DOM causados por tradutores nativos/extensões mutando o DOM do React.
 * Casam contra a mensagem do erro (não contra stack).
 */
/** YouTube IFrame API throws when the embed id is malformed — user pasted bad URL. */
export const YOUTUBE_PLAYER_NOISE: readonly RegExp[] = [
  /^Invalid video id$/i,
];

export const DOM_MUTATION_NOISE: readonly RegExp[] = [
  /Failed to execute 'insertBefore' on 'Node'[^]*not a child of this node/i,
  /Failed to execute 'removeChild' on 'Node'[^]*not a child of this node/i,
  /The node to be removed is not a child of this node/i,
  /The node before which the new node is to be inserted is not a child of this node/i,
];

function testAny(text: string | null | undefined, patterns: readonly RegExp[]): boolean {
  if (!text) return false;
  return patterns.some((re) => re.test(text));
}

/** True se a mensagem/stack vem de script de terceiro (adblock, rede, etc.). */
export function isThirdPartyScriptNoise(message: string, stack?: string | null): boolean {
  return testAny(message, THIRD_PART_SCRIPT_NOISE) || testAny(stack ?? '', THIRD_PART_SCRIPT_NOISE);
}

/** True se o erro é mutação de DOM por tradutor (Yandex/Aloha/Google Translate). */
export function isDomMutationNoise(message: string): boolean {
  return testAny(message, DOM_MUTATION_NOISE);
}

/** Combinação usada pelo ErrorBoundary: ruído se bater message, stack OU componentStack. */
export function isYoutubePlayerNoise(message: string, stack?: string | null): boolean {
  if (!testAny(message, YOUTUBE_PLAYER_NOISE)) return false;
  const hay = `${stack ?? ''} ${message}`;
  return /widgetapi|youtube\.com\/s\/player/i.test(hay);
}

export function isWalletExtensionNoise(message: string, stack?: string | null): boolean {
  return testAny(message, WALLET_EXTENSION_NOISE) || testAny(stack ?? '', WALLET_EXTENSION_NOISE);
}

export function isClientErrorNoise(
  message: string,
  stack?: string | null,
  componentStack?: string | null,
): boolean {
  return (
    isThirdPartyScriptNoise(message, stack) ||
    isThirdPartyScriptNoise(componentStack ?? '', null) ||
    isDomMutationNoise(message) ||
    isYoutubePlayerNoise(message, stack) ||
    isWalletExtensionNoise(message, stack)
  );
}
