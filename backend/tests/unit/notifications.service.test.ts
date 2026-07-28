import { NotificationsService } from "@/modules/notifications";
import { FakeEmailProvider, type EmailProvider } from "@/shared/services/email";

const LEAD = {
  agencyName: "Inmobiliaria Demo",
  propertyTitle: "Casa 3 ambientes",
  name: "Martín Pérez",
  email: "martin@correo.com",
  phone: "343 555 1234",
  message: "Me interesa, ¿coordinamos una visita?",
  panelUrl: "https://app.test/panel/leads",
};

const PAGO = {
  planName: "Pro",
  amount: "29999",
  currency: "ARS",
  panelUrl: "https://app.test/panel/suscripcion",
};

describe("NotificationsService", () => {
  it("arma el correo del lead con el asunto y los datos", async () => {
    const email = new FakeEmailProvider();
    const service = new NotificationsService(email);

    await service.leadRecibido("inmo@correo.com", LEAD);

    const [msg] = email.sent;
    expect(msg.to).toBe("inmo@correo.com");
    expect(msg.subject).toBe("Nueva consulta por Casa 3 ambientes");
    expect(msg.html).toContain("Martín Pérez");
    expect(msg.html).toContain("Me interesa");
    // La alternativa en texto no es opcional: hay clientes que no muestran HTML.
    expect(msg.text).toContain("Martín Pérez");
    expect(msg.text).toContain(LEAD.panelUrl);
  });

  it("escapa el HTML de lo que escribe el visitante", async () => {
    // El nombre y el mensaje vienen del formulario público: sin escapar, un
    // visitante podría inyectar marcado en el correo de la inmobiliaria.
    const email = new FakeEmailProvider();
    const service = new NotificationsService(email);

    await service.leadRecibido("inmo@correo.com", {
      ...LEAD,
      name: '<img src=x onerror="alert(1)">',
      message: "<script>robar()</script>",
    });

    const [msg] = email.sent;
    // Lo que importa no es que el texto "onerror" desaparezca —escapado es
    // inofensivo— sino que no quede ninguna etiqueta abierta por el visitante.
    expect(msg.html).not.toContain("<script");
    expect(msg.html).not.toContain("<img");
    expect(msg.html).toContain("&lt;script&gt;");
    expect(msg.html).toContain("&lt;img");
  });

  it("un proveedor caído NO rompe la operación que disparó el aviso", async () => {
    // Es la regla del módulo: si el correo falla, la consulta ya se guardó y
    // el pago ya se acreditó. Se pierde el mail, no la operación.
    const email: EmailProvider = {
      name: "roto",
      send: jest.fn().mockRejectedValue(new Error("SMTP caído")),
    };
    const service = new NotificationsService(email);

    await expect(service.leadRecibido("inmo@correo.com", LEAD)).resolves.toBeUndefined();
    await expect(service.pagoConfirmado("inmo@correo.com", PAGO)).resolves.toBeUndefined();
  });

  it("sin destinatario no intenta enviar", async () => {
    const email = new FakeEmailProvider();
    const service = new NotificationsService(email);

    await service.leadRecibido(null, LEAD);

    expect(email.sent).toHaveLength(0);
  });

  it("el aviso de pago confirmado lleva el monto y el plan", async () => {
    const email = new FakeEmailProvider();
    const service = new NotificationsService(email);

    await service.pagoConfirmado("inmo@correo.com", PAGO);

    const [msg] = email.sent;
    expect(msg.subject).toContain("Pro");
    expect(msg.html).toContain("29999");
    expect(msg.text).toContain("ARS 29999");
  });

  it("el aviso de pago rechazado aclara que la cuenta sigue activa", async () => {
    const email = new FakeEmailProvider();
    const service = new NotificationsService(email);

    await service.pagoFallido("inmo@correo.com", PAGO);

    const [msg] = email.sent;
    expect(msg.subject).toBe("No pudimos procesar tu pago");
    expect(msg.text).toContain("sigue funcionando");
  });

  it("la bienvenida incluye la dirección futura del sitio", async () => {
    const email = new FakeEmailProvider();
    const service = new NotificationsService(email);

    await service.inmobiliariaCreada("admin@inmo.com", {
      agencyName: "Inmobiliaria Demo",
      slug: "demo",
      panelUrl: "https://app.test/panel",
    });

    const [msg] = email.sent;
    expect(msg.html).toContain("/inmobiliaria/demo");
    expect(msg.subject).toContain("Inmobiliaria Demo");
  });
});
