import { closeDb, truncateAll } from "./helpers/db";

// `testTimeout` en jest.config.js es global, no por proyecto (Jest lo descarta
// con un warning si se lo pone dentro de `projects[]`): se fija acá, que sí
// corre solo para la suite de integración. La app tarda en levantar el pool
// en el primer test de cada suite.
jest.setTimeout(20_000);

// Antes de CADA test, no después: si un test se cuelga o se corre uno solo con
// -t, la base igual arranca limpia. Limpiar después deja basura cuando algo falla.
beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});
