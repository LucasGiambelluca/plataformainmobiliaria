/**
 * Formato de importes en pesos: 59900 → "$ 59.900".
 *
 * Los precios de los planes y de la facturación siempre se muestran en ARS.
 * Los de las propiedades no: pueden estar en dólares, y para eso está
 * `formatPrice` en `lib/propertyLabels.ts`, que recibe la moneda.
 */
export function formatARS(n: number): string {
  return `$ ${n.toLocaleString('es-AR')}`
}
