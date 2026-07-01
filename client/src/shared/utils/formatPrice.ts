/**
 * Formata um preço que pode vir como string ("1.00000000") ou número.
 *
 * - Inteiros aparecem sem casas decimais: `1.00000000` → `1`
 * - Decimais aparecem sem zeros à direita: `0.100000` → `0.1`, `1.500000` → `1.5`
 * - Respeita um teto de casas para evitar flutuação visual (padrão 8).
 *
 * Usado em Offers/Shop para não exibir "1.000000" nem "0.100000".
 */
export function formatPrice(price: number | string | null | undefined, maxDecimals = 8): string {
    if (price === null || price === undefined || price === '') return '0';
    const n = Number(price);
    if (!Number.isFinite(n)) return '0';
    // toFixed com teto de casas, depois poda zeros à direita e possível ponto solto.
    let s = n.toFixed(maxDecimals);
    if (s.indexOf('.') !== -1) {
        s = s.replace(/0+$/, '').replace(/\.$/, '');
    }
    return s;
}
