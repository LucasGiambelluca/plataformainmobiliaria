import { logger } from "@/config/logger";
import { NotFoundError, ValidationError } from "@/shared/errors";

export type AppraisalStatus =
  | "unassigned"
  | "new"
  | "contacted"
  | "completed"
  | "discarded";

export type AppraisalPropertyType =
  | "house"
  | "apartment"
  | "ph"
  | "duplex"
  | "commercial"
  | "office"
  | "warehouse"
  | "land"
  | "farm"
  | "country_house"
  | "ranch"
  | "other";

export type AppraisalPurpose = "sale" | "rent" | "sale_and_rent" | "other";

export type AppraisalCondition =
  | "excellent"
  | "very_good"
  | "good"
  | "fair"
  | "to_renovate";

/** Inmobiliaria habilitada para recibir tasaciones, como la ve el portal. */
export interface ParticipantAgency {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  /** A dónde se le avisa. Null = no cargó correo: no hay a quién escribirle. */
  contactEmail: string | null;
  /** Última asignación recibida. Null = nunca: va primera en el turno. */
  lastAssignedAt: Date | null;
}

export interface AppraisalRecord {
  id: string;
  tenantId: string | null;
  name: string;
  phone: string;
  email: string;
  city: string;
  neighborhood?: string | null;
  address: string;
  propertyType: AppraisalPropertyType;
  purpose: AppraisalPurpose;
  areaM2?: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
  condition?: AppraisalCondition | null;
  comments?: string | null;
  details?: unknown;
  status: AppraisalStatus;
  assignedAutomatically: boolean;
  assignedAt?: Date | null;
  createdAt: Date;
}

export interface ListQuery {
  status?: AppraisalStatus;
  page?: number;
  pageSize?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
}

export interface AppraisalsRepository {
  /**
   * Inmobiliarias con un plan que habilita tasaciones y suscripción vigente.
   * Con `city`, solo las que publican propiedades visibles en esa localidad.
   */
  listParticipants(city?: string): Promise<ParticipantAgency[]>;
  /** Null si no existe o si no participa: el llamador no distingue, a propósito. */
  findParticipantById(tenantId: string): Promise<ParticipantAgency | null>;
  create(data: Omit<AppraisalRecord, "id" | "createdAt">): Promise<AppraisalRecord>;
  /** Sella el turno rotativo de la inmobiliaria elegida. */
  touchAssignment(tenantId: string, cuando: Date): Promise<void>;
  /** Vincula las fotos del draft a la solicitud creada. Devuelve cuántas. */
  attachMedia(appraisalId: string, draftId: string): Promise<number>;
  listByTenant(tenantId: string, query: ListQuery): Promise<Paginated<AppraisalRecord>>;
  findByIdForTenant(id: string, tenantId: string): Promise<AppraisalRecord | null>;
  updateStatus(
    id: string,
    tenantId: string,
    status: AppraisalStatus,
  ): Promise<AppraisalRecord | null>;
  listUnassigned(query: ListQuery): Promise<Paginated<AppraisalRecord>>;
}

/**
 * Lo mínimo que el service necesita del módulo de notificaciones.
 *
 * Recibe la agencia además de la solicitud porque el correo va dirigido a
 * ella: sin `contactEmail` no hay a quién escribirle.
 */
export interface AppraisalNotifier {
  appraisalReceived(
    appraisal: AppraisalRecord,
    agency: ParticipantAgency,
  ): Promise<void>;
}

export interface CreateAppraisalInput
  extends Omit<
    AppraisalRecord,
    "id" | "createdAt" | "status" | "assignedAutomatically" | "assignedAt" | "tenantId"
  > {
  /** Inmobiliaria elegida por el propietario. Sin esto, la asigna el portal. */
  tenantId?: string;
  /** Draft de fotos subidas antes de mandar el formulario. */
  draftId?: string;
}

interface Opciones {
  ahora?: () => Date;
}

/**
 * Solicitudes de tasación online (§ sección Tasaciones del portal).
 *
 * El alta es pública: la escribe un propietario sin cuenta. Valen las mismas
 * dos reglas que en `inquiries`, y por el mismo motivo —el cuerpo lo redacta
 * cualquiera—:
 *
 * 1. **El `tenantId` sale siempre del servidor.** Si el propietario eligió una
 *    inmobiliaria, se valida contra el repositorio que exista y participe; si
 *    no eligió, la elige el portal. Un id que llegue en el body no se cree.
 * 2. **El estado lo decide el servidor**, nunca el formulario.
 *
 * Quién puede recibir solicitudes lo decide el plan (`Plan.hasOnlineAppraisals`),
 * no un interruptor de la inmobiliaria.
 */
export class AppraisalsService {
  private readonly ahora: () => Date;

  constructor(
    private readonly repo: AppraisalsRepository,
    private readonly notifier: AppraisalNotifier,
    opciones: Opciones = {},
  ) {
    this.ahora = opciones.ahora ?? (() => new Date());
  }

  /** Participantes que ve el portal, opcionalmente acotados a una localidad. */
  async listParticipants(city?: string): Promise<ParticipantAgency[]> {
    return city === undefined
      ? this.repo.listParticipants()
      : this.repo.listParticipants(city);
  }

  /**
   * Turno rotativo: la que hace más tiempo que no recibe una.
   *
   * `lastAssignedAt` null significa que nunca recibió, así que va primera.
   * Reparte parejo sin necesidad de llevar contadores.
   */
  private elegirPorTurno(participantes: ParticipantAgency[]): ParticipantAgency | null {
    if (participantes.length === 0) return null;

    return participantes.reduce((mejor, actual) => {
      if (mejor.lastAssignedAt === null) return mejor;
      if (actual.lastAssignedAt === null) return actual;
      return actual.lastAssignedAt < mejor.lastAssignedAt ? actual : mejor;
    });
  }

  async create(input: CreateAppraisalInput): Promise<AppraisalRecord> {
    const { tenantId: elegida, draftId, ...datos } = input;

    let destino: ParticipantAgency | null = null;
    let automatica = false;

    if (elegida) {
      destino = await this.repo.findParticipantById(elegida);

      // No se cae a la asignación automática: cambiarle la inmobiliaria por
      // otra sin avisar sería decidir por el propietario algo que él eligió.
      if (!destino) {
        throw new ValidationError(
          "La inmobiliaria elegida ya no está participando del servicio de tasaciones. Elegí otra de la lista.",
        );
      }
    } else {
      // Solo las que operan en la localidad del inmueble: mandarle un campo a
      // quien trabaja en otra punta de la provincia no le sirve a nadie.
      const participantes = await this.repo.listParticipants(datos.city);
      destino = this.elegirPorTurno(participantes);
      automatica = destino !== null;
    }

    const cuando = this.ahora();

    const creada = await this.repo.create({
      ...datos,
      tenantId: destino?.id ?? null,
      // Sin inmobiliaria posible la solicitud no se pierde: queda a la vista
      // del super admin en vez de asignarse a alguien que no opera ahí.
      status: destino ? "new" : "unassigned",
      assignedAutomatically: automatica,
      assignedAt: destino ? cuando : null,
    });

    // Todo lo que sigue al create es accesorio, y por eso ninguno de los dos
    // puede tirar la operación. La solicitud ya está guardada: si `touchAssignment`
    // o `attachMedia` fallan y se propaga el error, el propietario ve "no se pudo
    // enviar", vuelve a mandar el formulario y quedan dos solicitudes — y como el
    // aviso viene después, la inmobiliaria no se entera de ninguna de las dos.
    //
    // El costo de tragárselos es acotado: un turno que no avanza le da la
    // siguiente tasación a la misma inmobiliaria, y unas fotos que no se
    // adjuntan dejan la solicitud sin imágenes. Las dos cosas son molestas y
    // ninguna pierde a la persona que dejó su teléfono.
    if (destino) {
      try {
        await this.repo.touchAssignment(destino.id, cuando);
      } catch (err) {
        logger.error(
          { err, tenantId: destino.id },
          "No se pudo avanzar el turno de reparto de tasaciones",
        );
      }
    }

    if (draftId) {
      try {
        await this.repo.attachMedia(creada.id, draftId);
      } catch (err) {
        logger.error(
          { err, appraisalId: creada.id },
          "No se pudieron adjuntar las fotos a la tasación",
        );
      }
    }

    // Un correo caído no puede voltear la solicitud: la persona ya dejó sus
    // datos esperando respuesta. Mismo criterio que las consultas y los pagos.
    if (destino) {
      try {
        await this.notifier.appraisalReceived(creada, destino);
      } catch (err) {
        logger.error(
          { err, appraisalId: creada.id },
          "No se pudo avisar de la tasación recibida",
        );
      }
    }

    return creada;
  }

  // ── Bandeja de la inmobiliaria ────────────────────────────
  //
  // Ojo: acá NO se chequea el plan, y es deliberado. Una inmobiliaria que dejó
  // de ser premium sale del listado y del reparto (eso lo resuelve el
  // repositorio), pero sigue viendo lo que ya recibió: son personas reales
  // esperando una respuesta que ella se comprometió a dar.

  async list(tenantId: string, query: ListQuery): Promise<Paginated<AppraisalRecord>> {
    return this.repo.listByTenant(tenantId, query);
  }

  async changeStatus(
    id: string,
    tenantId: string,
    status: AppraisalStatus,
  ): Promise<AppraisalRecord> {
    const actualizada = await this.repo.updateStatus(id, tenantId, status);

    // Filtra por { id, tenantId }: si no es suya responde igual que si no
    // existiera, sin revelar que existe en otra inmobiliaria.
    if (!actualizada) throw new NotFoundError("Solicitud de tasación no encontrada");

    return actualizada;
  }

  /** Solicitudes que ninguna inmobiliaria pudo tomar. Solo super admin. */
  async listUnassigned(query: ListQuery): Promise<Paginated<AppraisalRecord>> {
    return this.repo.listUnassigned(query);
  }
}
