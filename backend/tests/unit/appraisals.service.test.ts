import {
  AppraisalsService,
  type AppraisalRecord,
  type AppraisalsRepository,
  type ParticipantAgency,
} from "@/modules/appraisals/appraisals.service";
import { ValidationError } from "@/shared/errors";

const NORTE = "11111111-1111-1111-1111-111111111111";
const SUR = "22222222-2222-2222-2222-222222222222";
const AJENA = "33333333-3333-3333-3333-333333333333";

const AHORA = new Date("2026-08-04T12:00:00Z");

/** Participantes de Paraná: Norte nunca recibió, Sur recibió ayer. */
const PARTICIPANTES: ParticipantAgency[] = [
  {
    id: NORTE,
    name: "Norte",
    slug: "norte",
    logoUrl: null,
    contactEmail: "norte@example.com",
    lastAssignedAt: null,
  },
  {
    id: SUR,
    name: "Sur",
    slug: "sur",
    logoUrl: null,
    contactEmail: "sur@example.com",
    lastAssignedAt: new Date("2026-08-03T12:00:00Z"),
  },
];

const SOLICITUD = {
  name: "Ana Pérez",
  phone: "+54 343 555 0000",
  email: "ana@example.com",
  city: "Paraná",
  address: "San Martín 123",
  propertyType: "house" as const,
  purpose: "sale" as const,
};

function makeRepo(overrides: Partial<AppraisalsRepository> = {}) {
  const repo: AppraisalsRepository = {
    listParticipants: jest.fn().mockResolvedValue(PARTICIPANTES),
    findParticipantById: jest.fn().mockResolvedValue(PARTICIPANTES[0]),
    create: jest.fn().mockImplementation(async (data: Partial<AppraisalRecord>) => ({
      id: "ap-1",
      status: "new",
      createdAt: AHORA,
      ...data,
    })),
    touchAssignment: jest.fn().mockResolvedValue(undefined),
    attachMedia: jest.fn().mockResolvedValue(0),
    listByTenant: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    findByIdForTenant: jest.fn().mockResolvedValue(null),
    updateStatus: jest.fn().mockResolvedValue(null),
    listUnassigned: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    ...overrides,
  };
  return repo;
}

const notifierMudo = { appraisalReceived: jest.fn().mockResolvedValue(undefined) };

function makeService(repo: AppraisalsRepository) {
  return new AppraisalsService(repo, notifierMudo, { ahora: () => AHORA });
}

describe("AppraisalsService - listado de participantes", () => {
  it("pide solo las inmobiliarias con el plan que habilita tasaciones", async () => {
    const repo = makeRepo();

    await makeService(repo).listParticipants();

    expect(repo.listParticipants).toHaveBeenCalled();
  });

  it("puede acotar el listado a una localidad", async () => {
    const repo = makeRepo();

    await makeService(repo).listParticipants("Paraná");

    expect(repo.listParticipants).toHaveBeenCalledWith("Paraná");
  });
});

describe("AppraisalsService - asignación automática", () => {
  it("elige a la que hace más tiempo que no recibe una", async () => {
    const repo = makeRepo();

    const creada = await makeService(repo).create({ ...SOLICITUD });

    // Norte nunca recibió: va primera en el turno.
    expect(creada.tenantId).toBe(NORTE);
    expect(creada.assignedAutomatically).toBe(true);
    expect(creada.status).toBe("new");
  });

  it("sella el turno de la elegida para que la próxima sea otra", async () => {
    const repo = makeRepo();

    await makeService(repo).create({ ...SOLICITUD });

    expect(repo.touchAssignment).toHaveBeenCalledWith(NORTE, AHORA);
  });

  it("busca participantes de la localidad de la propiedad, no de todas", async () => {
    const repo = makeRepo();

    await makeService(repo).create({ ...SOLICITUD, city: "Paraná" });

    expect(repo.listParticipants).toHaveBeenCalledWith("Paraná");
  });

  it("deja la solicitud sin asignar si no hay participantes en esa localidad", async () => {
    const repo = makeRepo({ listParticipants: jest.fn().mockResolvedValue([]) });

    const creada = await makeService(repo).create({ ...SOLICITUD, city: "Villaguay" });

    // No se le manda a alguien que no opera ahí: queda para el super admin.
    expect(creada.tenantId).toBeNull();
    expect(creada.status).toBe("unassigned");
    expect(repo.touchAssignment).not.toHaveBeenCalled();
  });
});

describe("AppraisalsService - elección manual", () => {
  it("respeta la inmobiliaria que eligió el propietario", async () => {
    const repo = makeRepo({
      findParticipantById: jest.fn().mockResolvedValue(PARTICIPANTES[1]),
    });

    const creada = await makeService(repo).create({ ...SOLICITUD, tenantId: SUR });

    expect(creada.tenantId).toBe(SUR);
    expect(creada.assignedAutomatically).toBe(false);
  });

  it("rechaza una inmobiliaria que no participa del servicio", async () => {
    // findParticipantById solo devuelve las que participan: null = no habilitada.
    const repo = makeRepo({ findParticipantById: jest.fn().mockResolvedValue(null) });

    await expect(
      makeService(repo).create({ ...SOLICITUD, tenantId: AJENA }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("no cae a la asignación automática cuando la elegida ya no es premium", async () => {
    // Si dejara de ser premium mientras llenaba el formulario, mandársela a
    // otra sin avisar sería cambiarle la inmobiliaria a espaldas del usuario.
    const repo = makeRepo({ findParticipantById: jest.fn().mockResolvedValue(null) });

    await makeService(repo)
      .create({ ...SOLICITUD, tenantId: AJENA })
      .catch(() => undefined);

    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe("AppraisalsService - el tenantId nunca sale del body", () => {
  it("valida contra el repositorio en vez de confiar en lo que llegó", async () => {
    const repo = makeRepo();

    await makeService(repo).create({ ...SOLICITUD, tenantId: SUR });

    expect(repo.findParticipantById).toHaveBeenCalledWith(SUR);
  });
});

describe("AppraisalsService - avisos", () => {
  it("le avisa a la inmobiliaria asignada", async () => {
    const repo = makeRepo();

    await makeService(repo).create({ ...SOLICITUD });

    expect(notifierMudo.appraisalReceived).toHaveBeenCalled();
  });

  it("no avisa cuando la solicitud quedó sin asignar", async () => {
    notifierMudo.appraisalReceived.mockClear();
    const repo = makeRepo({ listParticipants: jest.fn().mockResolvedValue([]) });

    await makeService(repo).create({ ...SOLICITUD });

    expect(notifierMudo.appraisalReceived).not.toHaveBeenCalled();
  });

  it("guarda la solicitud aunque el aviso falle", async () => {
    notifierMudo.appraisalReceived.mockRejectedValueOnce(new Error("SMTP caído"));
    const repo = makeRepo();

    const creada = await makeService(repo).create({ ...SOLICITUD });

    expect(creada.id).toBe("ap-1");
  });
});

describe("AppraisalsService - bandeja de la inmobiliaria", () => {
  it("no deja cambiar el estado de una solicitud de otra inmobiliaria", async () => {
    // findByIdForTenant filtra por { id, tenantId }: null = no es suya.
    const repo = makeRepo({ updateStatus: jest.fn().mockResolvedValue(null) });

    await expect(
      makeService(repo).changeStatus("ap-1", AJENA, "contacted"),
    ).rejects.toThrow();
  });
});
