import bcrypt from "bcryptjs";
import type { PropertyStatus, UserRole } from "@prisma/client";
import { prisma } from "./db";

/**
 * Altas mínimas para armar escenarios. Cada fábrica pide solo lo que el test
 * necesita nombrar y completa el resto: un test sobre aislamiento no tiene por
 * qué elegir el año de construcción de una propiedad.
 */

export const PASSWORD = "password-de-test";

/**
 * El alta self-serve exige que exista el plan "basico" (DEFAULT_PLAN_SLUG).
 * Por eso llamarla dos veces sin `slug` rompe el unique: pasale uno.
 */
export async function crearPlan(
  overrides: Partial<{
    slug: string;
    name: string;
    priceAmount: string;
    maxProperties: number;
    maxUsers: number;
    maxStorageMb: number;
    maxDomains: number;
  }> = {},
) {
  const slug = overrides.slug ?? "basico";
  return prisma.plan.create({
    data: {
      name: overrides.name ?? "Básico",
      slug,
      priceAmount: overrides.priceAmount ?? "0",
      maxProperties: overrides.maxProperties ?? 10,
      maxUsers: overrides.maxUsers ?? 2,
      maxStorageMb: overrides.maxStorageMb ?? 500,
      maxDomains: overrides.maxDomains ?? 0,
    },
  });
}

export async function crearTenant(
  slug: string,
  overrides: Partial<{ name: string; isActive: boolean }> = {},
) {
  return prisma.tenant.create({
    data: {
      name: overrides.name ?? `Inmobiliaria ${slug}`,
      slug,
      isActive: overrides.isActive ?? true,
      contactEmail: `hola@${slug}.test`,
    },
  });
}

export async function crearUsuario(
  tenantId: string | null,
  overrides: Partial<{ email: string; role: UserRole; name: string }> = {},
) {
  const email = overrides.email ?? `user-${crypto.randomUUID()}@test.com`;
  return prisma.user.create({
    data: {
      tenantId,
      email,
      passwordHash: await bcrypt.hash(PASSWORD, 4), // coste bajo: son tests
      role: overrides.role ?? "tenant_admin",
      name: overrides.name ?? "Usuario de prueba",
    },
  });
}

export async function crearSuscripcion(tenantId: string, planId: string) {
  return prisma.subscription.create({
    data: { tenantId, planId, status: "active" },
  });
}

export async function crearPropiedad(
  tenantId: string,
  overrides: Partial<{
    title: string;
    status: PropertyStatus;
    city: string;
    price: string;
  }> = {},
) {
  return prisma.property.create({
    data: {
      tenantId,
      title: overrides.title ?? "Casa de prueba",
      propertyType: "house",
      operationType: "sale",
      // Sin decimales de relleno a propósito: Postgres devuelve "150000.00"
      // como "150000", y un default con ceros invita a assertions que fallan.
      price: overrides.price ?? "150000",
      currency: "USD",
      city: overrides.city ?? "Paraná",
      status: overrides.status ?? "published",
    },
  });
}

/**
 * Inmobiliaria completa y lista para operar: plan, tenant, suscripción y admin.
 *
 * El admin queda como `admin@<slug>.test` y el plan como `plan-<slug>`: las
 * suites escriben esos strings a mano para loguearse, así que son parte del
 * contrato, no un detalle interno.
 */
export async function crearInmobiliariaCompleta(
  slug: string,
  opciones: {
    planSlug?: string;
    maxProperties?: number;
    maxUsers?: number;
    maxDomains?: number;
    isActive?: boolean;
  } = {},
) {
  // Los límites pasan crudos: quien tiene el default es crearPlan, repetirlo
  // acá haría que cambiar uno solo desincronizara los dos caminos.
  const { planSlug, isActive, ...limites } = opciones;
  const plan = await crearPlan({ slug: planSlug ?? `plan-${slug}`, ...limites });
  const tenant = await crearTenant(slug, { isActive });
  const subscription = await crearSuscripcion(tenant.id, plan.id);
  const admin = await crearUsuario(tenant.id, {
    email: `admin@${slug}.test`,
    role: "tenant_admin",
  });
  return { plan, tenant, subscription, admin };
}
