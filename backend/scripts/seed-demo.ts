/**
 * Datos de demostración.
 *
 * Deja la base en un estado presentable para mostrarle la plataforma a alguien:
 * tres inmobiliarias con web publicada, propiedades con fotos, consultas sin
 * leer y usuarios con contraseña conocida.
 *
 *   npx tsx scripts/seed-demo.ts
 *
 * Es idempotente: borra sus propias propiedades y consultas antes de volver a
 * crearlas, así que se puede correr las veces que haga falta.
 *
 * OJO — dos efectos sobre datos que ya estaban:
 *
 *  1. Desactiva (`is_active = false`) toda inmobiliaria que no sea de esta
 *     demo. Son las que dejaron los tests de integración y ensucian el portal.
 *     No las borra: para revertirlo alcanza con
 *     `update tenants set is_active = true;`.
 *
 *  2. Le pone al super admin la contraseña de la demo, porque la que tuviera
 *     no la sabe nadie.
 *
 * Las fotos apuntan a picsum.photos y no a MinIO a propósito: así se ven desde
 * cualquier lado sin depender de que el storage local sea alcanzable.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Demo1234!";
const SUPER_ADMIN_EMAIL = "admin@plataforma.com";

/** Marca en la descripción para reconocer lo que creó este script. */
const MARCA = "[demo]";

const foto = (semilla: string, orden: number) =>
  `https://picsum.photos/seed/${semilla}-${orden}/1200/800`;

interface PropiedadDemo {
  title: string;
  description: string;
  propertyType: Prisma.PropertyCreateManyInput["propertyType"];
  operationType: Prisma.PropertyCreateManyInput["operationType"];
  price: string;
  currency: string;
  city: string;
  address: string;
  areaM2: string;
  rooms: number;
  bathrooms: number;
  parking: number;
  status: Prisma.PropertyCreateManyInput["status"];
}

interface InmobiliariaDemo {
  slug: string;
  name: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  planSlug: string;
  admin: { email: string; name: string };
  agente?: { email: string; name: string };
  site: {
    primaryColor: string;
    secondaryColor: string;
    heroTitle: string;
    heroSubtitle: string;
    aboutText: string;
    whatsapp: string;
  };
  propiedades: PropiedadDemo[];
  consultas: { name: string; email: string; phone: string; message: string }[];
}

const inmobiliarias: InmobiliariaDemo[] = [
  {
    slug: "costa-uruguay",
    name: "Costa del Uruguay Propiedades",
    description:
      "Cuarenta años operando sobre la costa del río Uruguay. Venta, alquiler y administración de propiedades en Concepción del Uruguay, Colón y San José.",
    contactEmail: "contacto@costauruguay.demo",
    contactPhone: "+54 3442 44-1200",
    planSlug: "enterprise",
    admin: { email: "costa@demo.com", name: "Marcela Duarte" },
    agente: { email: "agente@demo.com", name: "Nicolás Ferreyra" },
    site: {
      primaryColor: "#0F766E",
      secondaryColor: "#F59E0B",
      heroTitle: "Tu próxima casa, sobre el río",
      heroSubtitle:
        "Propiedades seleccionadas en Concepción del Uruguay, Colón y San José.",
      aboutText:
        "Somos una inmobiliaria familiar fundada en 1985. Acompañamos cada operación de punta a punta: tasación, publicación, visitas, escritura y administración del alquiler.",
      whatsapp: "5493442441200",
    },
    propiedades: [
      {
        title: "Casa de tres dormitorios con parque a dos cuadras del río",
        description:
          "Casa en planta baja sobre lote de 12 x 40. Living comedor con hogar a leña, cocina independiente, galería con parrillero y parque con arboleda añosa. A dos cuadras de la costanera.",
        propertyType: "house",
        operationType: "sale",
        price: "165000",
        currency: "USD",
        city: "Concepción del Uruguay",
        address: "Rocamora 1240",
        areaM2: "180",
        rooms: 3,
        bathrooms: 2,
        parking: 1,
        status: "featured",
      },
      {
        title: "Departamento a estrenar de un dormitorio en el centro",
        description:
          "Monoambiente amplio con dormitorio separado, cocina integrada y balcón al frente. Edificio con ascensor y cochera opcional. Ideal renta.",
        propertyType: "apartment",
        operationType: "sale",
        price: "68000",
        currency: "USD",
        city: "Concepción del Uruguay",
        address: "9 de Julio 480, piso 4",
        areaM2: "52",
        rooms: 1,
        bathrooms: 1,
        parking: 0,
        status: "published",
      },
      {
        title: "Casa quinta con pileta en Colón",
        description:
          "Quinta de 2.500 m² con casa principal de tres dormitorios, quincho cerrado, pileta de 8 x 4 y arboleda. A diez minutos del centro de Colón.",
        propertyType: "house",
        operationType: "sale",
        price: "210000",
        currency: "USD",
        city: "Colón",
        address: "Camino a la Costa km 3",
        areaM2: "2500",
        rooms: 3,
        bathrooms: 2,
        parking: 2,
        status: "featured",
      },
      {
        title: "Local comercial sobre peatonal, 90 m²",
        description:
          "Local a la calle sobre la peatonal, con vidriera de 6 metros, depósito y baño. Excelente circulación todo el año.",
        propertyType: "commercial",
        operationType: "rent",
        price: "850000",
        currency: "ARS",
        city: "Concepción del Uruguay",
        address: "Perú 145",
        areaM2: "90",
        rooms: 0,
        bathrooms: 1,
        parking: 0,
        status: "published",
      },
      {
        title: "Terreno de 400 m² en barrio residencial",
        description:
          "Lote de 10 x 40 con todos los servicios en la puerta, apto dúplex. Calle asfaltada, a seis cuadras del acceso.",
        propertyType: "land",
        operationType: "sale",
        price: "32000",
        currency: "USD",
        city: "San José",
        address: "Los Ceibos 800",
        areaM2: "400",
        rooms: 0,
        bathrooms: 0,
        parking: 0,
        status: "published",
      },
      {
        title: "Cabaña para temporada frente al balneario",
        description:
          "Cabaña de dos ambientes totalmente equipada, con aire, parrilla propia y cochera. Alquiler por temporada, mínimo tres noches.",
        propertyType: "house",
        operationType: "temporary_rental",
        price: "95000",
        currency: "ARS",
        city: "Colón",
        address: "Balneario Norte, lote 12",
        areaM2: "45",
        rooms: 1,
        bathrooms: 1,
        parking: 1,
        status: "published",
      },
    ],
    consultas: [
      {
        name: "Julián Ríos",
        email: "julian.rios@gmail.demo",
        phone: "+54 9 3442 55-8899",
        message:
          "Hola, me interesa la casa de Rocamora. ¿Se puede visitar el sábado a la mañana? ¿Acepta parte de pago en un departamento?",
      },
      {
        name: "Carla Benítez",
        email: "carlabenitez@hotmail.demo",
        phone: "+54 9 3447 41-2233",
        message:
          "Buenas tardes, quería saber el valor de expensas del departamento del centro y si la cochera se vende aparte.",
      },
      {
        name: "Estudio Márquez",
        email: "administracion@marquez.demo",
        phone: "+54 3442 42-7001",
        message:
          "Consulta por el local de la peatonal: necesitamos 90 m² para oficina comercial. ¿Admite contrato a 36 meses?",
      },
    ],
  },
  {
    slug: "parana-hogar",
    name: "Paraná Hogar",
    description:
      "Inmobiliaria de Paraná especializada en departamentos y casas en zona centro, Puerto Viejo y Oro Verde.",
    contactEmail: "hola@paranahogar.demo",
    contactPhone: "+54 343 423-9800",
    planSlug: "pro",
    admin: { email: "parana@demo.com", name: "Sergio Almada" },
    site: {
      primaryColor: "#1D4ED8",
      secondaryColor: "#F97316",
      heroTitle: "Vivir en Paraná",
      heroSubtitle: "Departamentos, casas y lotes en la capital entrerriana.",
      aboutText:
        "Trabajamos hace quince años en el mercado de Paraná. Publicamos únicamente propiedades que visitamos y tasamos nosotros.",
      whatsapp: "5493434239800",
    },
    propiedades: [
      {
        title: "Departamento de dos dormitorios con vista al río",
        description:
          "Piso 9 con balcón corrido y vista abierta al Paraná. Dos dormitorios, uno en suite, cocina equipada, cochera cubierta y baulera.",
        propertyType: "apartment",
        operationType: "sale",
        price: "125000",
        currency: "USD",
        city: "Paraná",
        address: "Buenos Aires 230, piso 9",
        areaM2: "86",
        rooms: 2,
        bathrooms: 2,
        parking: 1,
        status: "featured",
      },
      {
        title: "Casa de dos plantas en Oro Verde",
        description:
          "Casa sobre lote de 15 x 30 en barrio cerrado. Planta baja con living, cocina comedor y toilette; arriba tres dormitorios y dos baños. Parque con riego.",
        propertyType: "house",
        operationType: "sale",
        price: "245000",
        currency: "USD",
        city: "Oro Verde",
        address: "Los Aromos 145",
        areaM2: "220",
        rooms: 3,
        bathrooms: 3,
        parking: 2,
        status: "published",
      },
      {
        title: "Monoambiente amoblado para alquiler",
        description:
          "Monoambiente completamente amoblado a tres cuadras de la Facultad. Incluye internet y expensas. Contrato mínimo doce meses.",
        propertyType: "apartment",
        operationType: "rent",
        price: "320000",
        currency: "ARS",
        city: "Paraná",
        address: "Urquiza 1855",
        areaM2: "34",
        rooms: 1,
        bathrooms: 1,
        parking: 0,
        status: "published",
      },
      {
        title: "Oficina en edificio corporativo, 120 m²",
        description:
          "Planta libre de 120 m² con dos baños, kitchenette y aire central. Edificio con seguridad 24 horas y estacionamiento para visitas.",
        propertyType: "office",
        operationType: "rent",
        price: "1450000",
        currency: "ARS",
        city: "Paraná",
        address: "Córdoba 620, piso 3",
        areaM2: "120",
        rooms: 0,
        bathrooms: 2,
        parking: 2,
        status: "published",
      },
      {
        title: "Galpón de 600 m² sobre ruta",
        description:
          "Galpón con portón de 5 metros, altura libre de 7, oficina y baño. Playa de maniobras propia. Salida directa a la ruta.",
        propertyType: "warehouse",
        operationType: "sale",
        price: "190000",
        currency: "USD",
        city: "San Benito",
        address: "Acceso Norte km 2",
        areaM2: "600",
        rooms: 0,
        bathrooms: 1,
        parking: 4,
        status: "published",
      },
    ],
    consultas: [
      {
        name: "Ana Lucía Ibarra",
        email: "analu.ibarra@gmail.demo",
        phone: "+54 9 343 466-1122",
        message:
          "Me interesa el departamento con vista al río. ¿Está tomando crédito hipotecario? ¿Cuánto son las expensas?",
      },
      {
        name: "Pablo Sosa",
        email: "psosa@empresa.demo",
        phone: "+54 9 343 415-9080",
        message:
          "Buen día, consulto por la oficina de calle Córdoba. Necesitaríamos mudarnos en marzo. ¿Sigue disponible?",
      },
    ],
  },
  {
    slug: "gualeguaychu-inmuebles",
    name: "Gualeguaychú Inmuebles",
    description:
      "Compra, venta y alquiler en Gualeguaychú y la zona de Pueblo General Belgrano.",
    contactEmail: "info@gchuinmuebles.demo",
    contactPhone: "+54 3446 43-5566",
    planSlug: "basico",
    admin: { email: "gualeguaychu@demo.com", name: "Vanina Correa" },
    site: {
      primaryColor: "#047857",
      secondaryColor: "#DC2626",
      heroTitle: "Gualeguaychú, todo el año",
      heroSubtitle: "Casas, lotes y propiedades para renta turística.",
      aboutText:
        "Atendemos personalmente cada consulta. Especialistas en propiedades con potencial de renta durante la temporada de carnaval.",
      whatsapp: "5493446435566",
    },
    propiedades: [
      {
        title: "Casa de cuatro dormitorios en barrio Munilla",
        description:
          "Casa amplia sobre lote de 10 x 45, con living comedor, cocina con isla, cuatro dormitorios, dos baños y garaje para dos autos. Fondo con parrillero.",
        propertyType: "house",
        operationType: "sale",
        price: "142000",
        currency: "USD",
        city: "Gualeguaychú",
        address: "Chacabuco 1580",
        areaM2: "195",
        rooms: 4,
        bathrooms: 2,
        parking: 2,
        status: "featured",
      },
      {
        title: "Dúplex a estrenar cerca del corsódromo",
        description:
          "Dúplex de dos dormitorios con patio propio, cochera descubierta y cocina equipada. Excelente renta durante la temporada.",
        propertyType: "house",
        operationType: "sale",
        price: "89000",
        currency: "USD",
        city: "Gualeguaychú",
        address: "Concordia 340",
        areaM2: "78",
        rooms: 2,
        bathrooms: 2,
        parking: 1,
        status: "published",
      },
      {
        title: "Lote de 600 m² en Pueblo General Belgrano",
        description:
          "Terreno de 15 x 40 a cinco cuadras del río, con luz y agua. Zona de crecimiento, apto construcción de cabañas.",
        propertyType: "land",
        operationType: "sale",
        price: "27500",
        currency: "USD",
        city: "Pueblo General Belgrano",
        address: "Las Retamas s/n",
        areaM2: "600",
        rooms: 0,
        bathrooms: 0,
        parking: 0,
        status: "published",
      },
      {
        title: "Departamento de dos ambientes para temporada",
        description:
          "Departamento equipado para cuatro personas, con aire acondicionado y cochera. Alquiler semanal durante enero y febrero.",
        propertyType: "apartment",
        operationType: "temporary_rental",
        price: "180000",
        currency: "ARS",
        city: "Gualeguaychú",
        address: "San Martín 720, piso 2",
        areaM2: "48",
        rooms: 1,
        bathrooms: 1,
        parking: 1,
        status: "published",
      },
    ],
    consultas: [
      {
        name: "Ramiro Vega",
        email: "ramiro.vega@gmail.demo",
        phone: "+54 9 3446 40-7788",
        message:
          "Hola! Consulto por el lote de Pueblo General Belgrano. ¿Tiene medidor de luz puesto o hay que gestionarlo?",
      },
    ],
  },
];

async function usuario(
  tenantId: string,
  email: string,
  name: string,
  role: "tenant_admin" | "agent",
  passwordHash: string,
): Promise<void> {
  await prisma.user.upsert({
    where: { email },
    update: { tenantId, name, role, passwordHash, isActive: true },
    create: { tenantId, email, name, role, passwordHash, isActive: true },
  });
}

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const slugsDemo = inmobiliarias.map((i) => i.slug);

  // ── Super admin ────────────────────────────────────────────
  const planes = await prisma.plan.findMany();
  if (planes.length === 0) {
    throw new Error("No hay planes. Corré primero `npm run prisma:seed`.");
  }

  await prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    update: { passwordHash, isActive: true },
    create: {
      tenantId: null,
      email: SUPER_ADMIN_EMAIL,
      passwordHash,
      role: "super_admin",
      name: "Super Admin",
      isActive: true,
    },
  });
  console.log(`✔ Super admin listo: ${SUPER_ADMIN_EMAIL}`);

  // ── Inmobiliarias ──────────────────────────────────────────
  for (const inmo of inmobiliarias) {
    const plan = planes.find((p) => p.slug === inmo.planSlug);
    if (!plan) throw new Error(`Falta el plan ${inmo.planSlug}`);

    const tenant = await prisma.tenant.upsert({
      where: { slug: inmo.slug },
      update: {
        name: inmo.name,
        description: inmo.description,
        contactEmail: inmo.contactEmail,
        contactPhone: inmo.contactPhone,
        isActive: true,
      },
      create: {
        slug: inmo.slug,
        name: inmo.name,
        description: inmo.description,
        contactEmail: inmo.contactEmail,
        contactPhone: inmo.contactPhone,
        isActive: true,
      },
    });

    await usuario(tenant.id, inmo.admin.email, inmo.admin.name, "tenant_admin", passwordHash);
    if (inmo.agente) {
      await usuario(tenant.id, inmo.agente.email, inmo.agente.name, "agent", passwordHash);
    }

    // Suscripción activa con período abierto, para que el panel muestre plan
    // vigente y no un cartel de "sin suscripción".
    const desde = new Date();
    const hasta = new Date(desde);
    hasta.setMonth(hasta.getMonth() + 1);

    const suscripcion = await prisma.subscription.findFirst({
      where: { tenantId: tenant.id },
    });
    if (suscripcion) {
      await prisma.subscription.update({
        where: { id: suscripcion.id },
        data: {
          planId: plan.id,
          status: "active",
          currentPeriodStart: desde,
          currentPeriodEnd: hasta,
          pendingPlanId: null,
        },
      });
    } else {
      await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: "active",
          currentPeriodStart: desde,
          currentPeriodEnd: hasta,
        },
      });
    }

    await prisma.tenantSiteConfig.upsert({
      where: { tenantId: tenant.id },
      update: {
        primaryColor: inmo.site.primaryColor,
        secondaryColor: inmo.site.secondaryColor,
        heroTitle: inmo.site.heroTitle,
        heroSubtitle: inmo.site.heroSubtitle,
        aboutText: inmo.site.aboutText,
        socialWhatsapp: inmo.site.whatsapp,
        isPublished: true,
      },
      create: {
        tenantId: tenant.id,
        primaryColor: inmo.site.primaryColor,
        secondaryColor: inmo.site.secondaryColor,
        heroTitle: inmo.site.heroTitle,
        heroSubtitle: inmo.site.heroSubtitle,
        aboutText: inmo.site.aboutText,
        socialWhatsapp: inmo.site.whatsapp,
        isPublished: true,
      },
    });

    // Las propiedades se rehacen enteras: es la única forma de que volver a
    // correr el script no deje seis copias de cada una.
    await prisma.property.deleteMany({
      where: { tenantId: tenant.id, description: { contains: MARCA } },
    });
    await prisma.inquiry.deleteMany({ where: { tenantId: tenant.id } });

    const creador = await prisma.user.findUnique({ where: { email: inmo.admin.email } });

    for (const [i, p] of inmo.propiedades.entries()) {
      const propiedad = await prisma.property.create({
        data: {
          tenantId: tenant.id,
          title: p.title,
          description: `${p.description}\n\n${MARCA}`,
          propertyType: p.propertyType,
          operationType: p.operationType,
          price: p.price,
          currency: p.currency,
          address: p.address,
          city: p.city,
          state: "Entre Ríos",
          country: "Argentina",
          areaM2: p.areaM2,
          rooms: p.rooms,
          bathrooms: p.bathrooms,
          parking: p.parking,
          status: p.status,
          viewsCount: 12 + i * 7,
          createdBy: creador?.id ?? null,
        },
      });

      await prisma.propertyMedia.createMany({
        data: [0, 1, 2].map((orden) => ({
          propertyId: propiedad.id,
          tenantId: tenant.id,
          type: "image" as const,
          url: foto(`${inmo.slug}-${i}`, orden),
          sizeBytes: BigInt(280_000),
          sortOrder: orden,
          isCover: orden === 0,
          status: "ready" as const,
        })),
      });
    }

    const propiedades = await prisma.property.findMany({
      where: { tenantId: tenant.id },
      select: { id: true },
      take: inmo.consultas.length,
    });

    for (const [i, c] of inmo.consultas.entries()) {
      await prisma.inquiry.create({
        data: {
          tenantId: tenant.id,
          propertyId: propiedades[i]?.id ?? null,
          name: c.name,
          email: c.email,
          phone: c.phone,
          message: c.message,
          status: i === 0 ? "new" : i === 1 ? "new" : "contacted",
        },
      });
    }

    console.log(
      `✔ ${inmo.name} (/${inmo.slug}) — plan ${plan.name}, ${inmo.propiedades.length} propiedades, ${inmo.consultas.length} consultas`,
    );
  }

  // ── Basura de los tests fuera del portal ───────────────────
  const apagadas = await prisma.tenant.updateMany({
    where: { slug: { notIn: slugsDemo }, isActive: true },
    data: { isActive: false },
  });
  if (apagadas.count > 0) {
    console.log(
      `• ${apagadas.count} inmobiliarias de prueba desactivadas (revertir: update tenants set is_active = true;)`,
    );
  }

  console.log(`\nContraseña de todas las cuentas: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
