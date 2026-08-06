/**
 * La provincia donde opera la plataforma.
 *
 * No se carga en el alta: las localidades del catálogo son todas de Entre Ríos,
 * así que la provincia ya está implícita en la localidad y pedirla era pedir un
 * dato que se puede escribir mal. Se usa para mostrar la ubicación completa en
 * la ficha y para el `addressRegion` del JSON-LD.
 *
 * Es la única cosa del catálogo que sí está escrita de este lado. El resto —la
 * lista de las 71— se baja de `GET /api/public/localidades`, porque el backend
 * valida contra ella y una copia desactualizada acá ofrecería opciones que el
 * servidor rechaza. Con la provincia no pasa: no se valida nada contra este
 * string, solo se muestra, así que lo peor que puede hacer una divergencia es
 * mostrar un nombre viejo. Su par en el backend es `PROVINCIA` en
 * `shared/constants/localidades.ts`.
 */
export const PROVINCIA = 'Entre Ríos'
