import { z } from "zod";

/**
 * La provincia no se carga: se deduce.
 *
 * Las setenta y una localidades del catálogo son de Entre Ríos, así que pedirle
 * la provincia a quien publica es pedirle un dato que ya está implícito en la
 * localidad y que puede escribir mal. Vive como constante porque igual hace
 * falta para el `addressRegion` del JSON-LD y para mostrar la ubicación
 * completa en la ficha.
 */
export const PROVINCIA = "Entre Ríos";

/**
 * Localidades de Entre Ríos donde opera la plataforma.
 *
 * Es un **catálogo cerrado**: el alta de una propiedad, el formulario público
 * de tasación y el filtro del catálogo solo aceptan uno de estos nombres, y
 * cualquier otra cosa se rechaza con un 422.
 *
 * Cerrarlo no es una preferencia de prolijidad, arregla un bug concreto. El
 * reparto de tasaciones cruza la localidad que eligió el propietario contra la
 * de las propiedades publicadas de cada inmobiliaria
 * (`appraisals.repository.ts`), y ese cruce usa `mode: "insensitive"`, que
 * ignora mayúsculas pero **no ignora tildes**. Con texto libre, una
 * inmobiliaria que cargó "Parana" nunca recibía una tasación de alguien que
 * escribió "Paraná". Lo mismo hacía que el filtro por ciudad del portal
 * mostrara la misma localidad dos veces.
 *
 * **El backend es el dueño de la lista y el frontend no la duplica**: la baja
 * por `GET /api/public/localidades`. Si estuviera escrita en los dos lados y
 * divergieran, el desplegable ofrecería una localidad que el servidor rechaza.
 * Es la misma trampa que ya documenta CLAUDE.md para la lista de subdominios
 * reservados de `host.ts`, y ahí son seis strings; acá son setenta y uno.
 *
 * Orden alfabético en castellano, que es como se muestra en el desplegable.
 *
 * Cuatro nombres vinieron dudosos de la lista original y quedaron con la
 * lectura más probable. Si alguno está mal, es cambiar el string:
 * "Aldea Spatzenkutter" (llegó con una sola t), "Colonia Adela" y
 * "Sauce Montrull" (llegaron pegados, se separaron en dos), "Gualeguaychú"
 * (llegó sin la G inicial) y "Neuquén" (raro en una lista de Entre Ríos).
 */
export const LOCALIDADES = [
  "Aldea San Antonio",
  "Aldea San Juan",
  "Aldea Santa María",
  "Aldea Spatzenkutter",
  "Aldea Valle María",
  "Basavilbaso",
  "Bovril",
  "Caseros",
  "Cerrito",
  "Chajarí",
  "Colón",
  "Colonia Adela",
  "Colonia Avellaneda",
  "Colonia Ensayo",
  "Colonia Nueva",
  "Concepción del Uruguay",
  "Concordia",
  "Crespo",
  "Diamante",
  "Febré",
  "Federación",
  "Federal",
  "General Galarza",
  "General Ramírez",
  "Gualeguay",
  "Gualeguaychú",
  "Hasenkamp",
  "Hernandarias",
  "Hernández",
  "Irazusta",
  "La Clarita",
  "La Paz",
  "Larroque",
  "Libertador San Martín",
  "Los Conquistadores",
  "Lucas González",
  "Maciá",
  "María Grande",
  "Mojones Norte",
  "Neuquén",
  "Nogoyá",
  "Oro Verde",
  "Paraná",
  "Primero de Mayo",
  "Pronunciamiento",
  "Pueblo General Belgrano",
  "Puerto Yeruá",
  "Racedo",
  "Rosario del Tala",
  "San Benito",
  "San Jaime de la Frontera",
  "San José",
  "San José de Feliciano",
  "San Salvador",
  "Santa Ana",
  "Santa Anita",
  "Santa Elena",
  "Sauce Montrull",
  "Seguí",
  "Strobel",
  "Tabossi",
  "Urdinarrain",
  "Viale",
  "Victoria",
  "Villa Adela",
  "Villa Clara",
  "Villa del Rosario",
  "Villa Elisa",
  "Villa Paranacito",
  "Villa Urquiza",
  "Villaguay",
] as const;

export type Localidad = (typeof LOCALIDADES)[number];

/**
 * Validación de una localidad.
 *
 * Vive acá y no en el schema de cada módulo porque la usan cuatro: el alta de
 * propiedad, el filtro del panel, el catálogo público y el formulario de
 * tasación. Repetir el `errorMap` en los cuatro deja que se desincronicen los
 * mensajes.
 */
export const localidadSchema = z.enum(LOCALIDADES, {
  errorMap: () => ({ message: "Elegí una localidad de la lista" }),
});

/**
 * Clave de comparación: sin tildes, sin mayúsculas y sin espacios de más.
 *
 * El descarte de diacríticos usa la propiedad Unicode `\p{Diacritic}` y no un
 * rango de caracteres escrito a mano. La versión anterior llevaba los propios
 * caracteres combinantes literales dentro de la clase: bytes invisibles en el
 * fuente que cualquier reguardado en otra codificación, o cualquier
 * herramienta que normalice el archivo, rompía sin avisar. Cuando eso pasa la
 * clase deja de matchear, `clave("Paraná")` devuelve "paraná" en vez de
 * "parana", y el script de normalización reporta las cuarenta y pico de
 * localidades con tilde como "sin correspondencia en el catálogo". Escrito así
 * es todo ASCII y no hay nada que se pueda corromper en silencio.
 */
function clave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const PORCLAVE = new Map<string, Localidad>(LOCALIDADES.map((l) => [clave(l), l]));

/**
 * Localidad canónica que le corresponde a un texto escrito a mano, o null si no
 * hay ninguna.
 *
 * No la usa la validación —para eso está el enum, que exige el nombre exacto—
 * sino el script que normaliza las ciudades cargadas antes de que existiera
 * este catálogo. Es justamente lo que la base no sabía hacer: "PARANA",
 * "parana" y "Paraná" son la misma ciudad.
 */
export function normalizarLocalidad(texto: string): Localidad | null {
  return PORCLAVE.get(clave(texto)) ?? null;
}
