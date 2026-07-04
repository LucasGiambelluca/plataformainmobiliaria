import { BaseRepository, type PrismaDelegate } from "@/shared/repository/BaseRepository";
import { NotFoundError } from "@/shared/errors";

// Delegate falso que registra los args recibidos.
function makeDelegate(overrides: Partial<PrismaDelegate> = {}) {
  const calls: Record<string, unknown[]> = {};
  const rec = (name: string) => (args: unknown) => {
    (calls[name] ??= []).push(args);
    return undefined;
  };
  const delegate: PrismaDelegate = {
    findMany: async (a) => (rec("findMany")(a), []),
    findFirst: async (a) => (rec("findFirst")(a), null),
    create: async (a) => (rec("create")(a), { id: "x" }),
    update: async (a) => (rec("update")(a), { id: "x" }),
    delete: async (a) => (rec("delete")(a), { id: "x" }),
    count: async (a) => (rec("count")(a), 0),
    ...overrides,
  };
  return { delegate, calls };
}

class TestRepo extends BaseRepository<{ id: string }> {
  constructor(delegate: PrismaDelegate) {
    super(delegate);
  }
}

describe("BaseRepository (aislamiento por tenant)", () => {
  it("inyecta tenantId en findMany", async () => {
    const { delegate, calls } = makeDelegate();
    const repo = new TestRepo(delegate);
    await repo.findMany("t1", { status: "active" });
    expect(calls.findMany[0]).toEqual({ where: { status: "active", tenantId: "t1" } });
  });

  it("findById filtra por id + tenantId", async () => {
    const { delegate, calls } = makeDelegate();
    const repo = new TestRepo(delegate);
    await repo.findById("r1", "t1");
    expect(calls.findFirst[0]).toEqual({ where: { id: "r1", tenantId: "t1" } });
  });

  it("findByIdOrThrow lanza NotFound si el recurso es de otro tenant", async () => {
    const { delegate } = makeDelegate({ findFirst: async () => null });
    const repo = new TestRepo(delegate);
    await expect(repo.findByIdOrThrow("r1", "t1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("create fuerza el tenantId del contexto", async () => {
    const { delegate, calls } = makeDelegate();
    const repo = new TestRepo(delegate);
    await repo.create("t1", { title: "Casa" });
    expect(calls.create[0]).toEqual({ data: { title: "Casa", tenantId: "t1" } });
  });

  it("update verifica pertenencia antes de escribir", async () => {
    const { delegate } = makeDelegate({ findFirst: async () => null });
    const repo = new TestRepo(delegate);
    await expect(repo.update("r1", "t1", { title: "x" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("delete verifica pertenencia antes de borrar", async () => {
    const { delegate } = makeDelegate({ findFirst: async () => null });
    const repo = new TestRepo(delegate);
    await expect(repo.delete("r1", "t1")).rejects.toBeInstanceOf(NotFoundError);
  });
});
