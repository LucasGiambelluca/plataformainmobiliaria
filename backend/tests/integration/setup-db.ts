import { closeDb, exigirBaseDeTest, truncateAll } from "./helpers/db";

// A nivel de módulo y no dentro de un hook: los `beforeAll` de cada archivo
// corren ANTES que cualquier `beforeEach`, así que un chequeo dentro de
// truncateAll llegaría tarde para frenar un seed contra la base equivocada.
exigirBaseDeTest();

// `testTimeout` en jest.config.js es global, no por proyecto (Jest lo descarta
// con un warning si se lo pone dentro de `projects[]`): se fija acá, que sí
// corre solo para la suite de integración. La app tarda en levantar el pool
// en el primer test de cada suite.
jest.setTimeout(20_000);

// Antes de CADA test, no después: si un test se cuelga o se corre uno solo con
// -t, la base igual arranca limpia. Limpiar después deja basura cuando algo falla.
//
// Corolario para las suites: sembrar en `beforeEach`, NUNCA en `beforeAll`.
// Jest corre todos los `beforeAll` antes del primer `beforeEach`, así que un
// seed de `beforeAll` lo borra este truncate y el test ve la base vacía sin
// que salte ningún error.
beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});
