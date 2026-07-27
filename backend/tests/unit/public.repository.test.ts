// Prisma se mockea para poder inspeccionar el `where` de cada consulta: lo que
// se verifica acá no es el resultado, es que NINGUNA query del catálogo público
// salga sin el filtro de visibilidad.
const property = {
  findMany: jest.fn().mockResolvedValue([]),
  findFirst: jest.fn().mockResolvedValue(null),
  count: jest.fn().mockResolvedValue(0),
  updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  groupBy: jest.fn().mockResolvedValue([]),
};
const tenant = { findMany: jest.fn().mockResolvedValue([]) };

jest.mock("@/config/database", () => ({ prisma: { property, tenant } }));

import { publicRepository } from "@/modules/public/public.repository";

/** Todo `where` del catálogo tiene que exigir estas dos cosas. */
function esperarVisibilidad(where: Record<string, unknown>) {
  expect(where.status).toEqual({ in: ["published", "featured"] });
  expect(where.tenant).toMatchObject({ isActive: true });
}

const baseInput = { page: 1, pageSize: 24, sort: "relevance" as const };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("publicRepository — filtro de visibilidad", () => {
  it("el listado solo pide publicadas y destacadas de inmobiliarias activas", async () => {
    await publicRepository.listProperties(baseInput);

    const [args] = property.findMany.mock.calls[0];
    esperarVisibilidad(args.where);
  });

  it("el contador del listado usa el mismo filtro que la consulta", async () => {
    // Si divergen, el total dice 40 y se ven 12: paginado roto y datos filtrados.
    await publicRepository.listProperties(baseInput);

    const [findArgs] = property.findMany.mock.calls[0];
    const [countArgs] = property.count.mock.calls[0];
    expect(countArgs.where).toEqual(findArgs.where);
  });

  it("los filtros del usuario no pisan la visibilidad", async () => {
    await publicRepository.listProperties({
      ...baseInput,
      city: "Paraná",
      minPrice: 1000,
      operationType: "rent",
    });

    const [args] = property.findMany.mock.calls[0];
    esperarVisibilidad(args.where);
    expect(args.where.operationType).toBe("rent");
  });

  it("filtrar por inmobiliaria no habilita ver una suspendida", async () => {
    // `agency` reescribe la cláusula tenant: tiene que seguir exigiendo isActive.
    await publicRepository.listProperties({ ...baseInput, agency: "demo" });

    const [args] = property.findMany.mock.calls[0];
    expect(args.where.tenant).toEqual({ isActive: true, slug: "demo" });
  });

  it("la ficha exige visibilidad además del id", async () => {
    await publicRepository.findPropertyById("p1");

    const [args] = property.findFirst.mock.calls[0];
    expect(args.where.id).toBe("p1");
    esperarVisibilidad(args.where);
  });

  it("contar una vista también exige visibilidad", async () => {
    // Si dejó de ser visible entre la lectura y la escritura, no se cuenta.
    await publicRepository.incrementViews("p1");

    const [args] = property.updateMany.mock.calls[0];
    expect(args.where.id).toBe("p1");
    esperarVisibilidad(args.where);
  });

  it("el directorio solo lista inmobiliarias activas", async () => {
    await publicRepository.listAgencies();

    const [args] = tenant.findMany.mock.calls[0];
    expect(args.where).toEqual({ isActive: true });
  });

  it("las localidades se cuentan solo sobre propiedades visibles", async () => {
    await publicRepository.listCities();

    const [args] = property.groupBy.mock.calls[0];
    esperarVisibilidad(args.where);
  });

  it("el listado solo muestra multimedia ya subida", async () => {
    // Una imagen en `processing` apuntaría a un archivo que todavía no está.
    await publicRepository.listProperties(baseInput);

    const [args] = property.findMany.mock.calls[0];
    expect(args.select.media.where).toEqual({ status: "ready" });
  });

  it("ordena las destacadas primero", async () => {
    await publicRepository.listProperties(baseInput);

    const [args] = property.findMany.mock.calls[0];
    expect(args.orderBy[0]).toEqual({ status: "desc" });
  });
});
