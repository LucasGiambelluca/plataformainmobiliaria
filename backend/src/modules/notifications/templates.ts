import type { EmailMessage } from "@/shared/services/email";

/**
 * Plantillas de correo. HTML plano y en línea a propósito: los clientes de
 * mail no soportan hojas de estilo externas, y una imagen remota se bloquea o
 * delata que abriste el mail.
 *
 * Toda variable que venga del usuario pasa por `escapar` antes de entrar al
 * HTML: el nombre y el mensaje de una consulta los escribe cualquiera desde
 * el formulario público.
 */
function escapar(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const MARCA = "#0F3258";

function layout(titulo: string, cuerpo: string, cta?: { url: string; label: string }): string {
  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f4f6f5;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#222">
  <table role="presentation" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dee2e6;border-radius:8px">
    <tr><td style="padding:24px 28px">
      <p style="margin:0 0 4px;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:${MARCA}">Entre Rios Propiedades</p>
      <h1 style="margin:0 0 16px;font-size:20px;color:${MARCA}">${escapar(titulo)}</h1>
      ${cuerpo}
      ${
        cta
          ? `<p style="margin:24px 0 0"><a href="${cta.url}" style="display:inline-block;background:${MARCA};color:#fff;text-decoration:none;padding:10px 20px;border-radius:4px;font-size:14px">${escapar(cta.label)}</a></p>`
          : ""
      }
    </td></tr>
  </table>
  <p style="max-width:560px;margin:12px auto 0;font-size:11px;color:#888;text-align:center">
    Este es un correo automático de la plataforma. No respondas a esta dirección.
  </p>
</body></html>`;
}

const p = (texto: string) =>
  `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${texto}</p>`;

export interface NuevoLeadData {
  agencyName: string;
  propertyTitle: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  panelUrl: string;
}

export function nuevoLead(to: string, d: NuevoLeadData): EmailMessage {
  const contacto = [d.email, d.phone].filter(Boolean).join(" · ");

  return {
    to,
    subject: `Nueva consulta por ${d.propertyTitle}`,
    html: layout(
      "Recibiste una consulta",
      p(`<strong>${escapar(d.name)}</strong> consultó por <strong>${escapar(d.propertyTitle)}</strong>.`) +
        p(escapar(contacto)) +
        `<blockquote style="margin:16px 0;padding:12px 16px;background:#f4f6f5;border-left:3px solid ${MARCA};font-size:14px;white-space:pre-line">${escapar(d.message)}</blockquote>`,
      { url: d.panelUrl, label: "Ver en el panel" },
    ),
    text: [
      `${d.name} consultó por ${d.propertyTitle}.`,
      contacto,
      "",
      d.message,
      "",
      `Ver en el panel: ${d.panelUrl}`,
    ].join("\n"),
  };
}

export interface BienvenidaData {
  agencyName: string;
  slug: string;
  panelUrl: string;
}

export function bienvenida(to: string, d: BienvenidaData): EmailMessage {
  return {
    to,
    subject: `${d.agencyName} ya está en Entre Rios Propiedades`,
    html: layout(
      `Bienvenidos, ${d.agencyName}`,
      p("Tu cuenta quedó creada con el plan Básico activo.") +
        p("Cargá tus primeras propiedades con fotos y configurá tu sitio web propio desde el panel.") +
        p(`La dirección de tu web va a ser <strong>/inmobiliaria/${escapar(d.slug)}</strong> una vez que la publiques.`),
      { url: d.panelUrl, label: "Entrar al panel" },
    ),
    text: [
      `Bienvenidos, ${d.agencyName}.`,
      "Tu cuenta quedó creada con el plan Básico activo.",
      `Tu web va a estar en /inmobiliaria/${d.slug} cuando la publiques.`,
      "",
      `Entrar al panel: ${d.panelUrl}`,
    ].join("\n"),
  };
}

export interface PagoData {
  planName: string;
  amount: string;
  currency: string;
  panelUrl: string;
}

export function pagoAprobado(to: string, d: PagoData): EmailMessage {
  return {
    to,
    subject: `Pago confirmado — plan ${d.planName}`,
    html: layout(
      "Pago confirmado",
      p(`Recibimos tu pago de <strong>${escapar(d.currency)} ${escapar(d.amount)}</strong>.`) +
        p(`Tu plan <strong>${escapar(d.planName)}</strong> ya está activo con sus nuevos límites.`),
      { url: d.panelUrl, label: "Ver mi suscripción" },
    ),
    text: [
      `Recibimos tu pago de ${d.currency} ${d.amount}.`,
      `Tu plan ${d.planName} ya está activo.`,
      "",
      `Ver tu suscripción: ${d.panelUrl}`,
    ].join("\n"),
  };
}

export function pagoRechazado(to: string, d: PagoData): EmailMessage {
  return {
    to,
    subject: "No pudimos procesar tu pago",
    html: layout(
      "El pago no se pudo procesar",
      p(`El cobro de <strong>${escapar(d.currency)} ${escapar(d.amount)}</strong> del plan ${escapar(d.planName)} fue rechazado.`) +
        p("Tu cuenta sigue funcionando, pero conviene revisar el medio de pago para no perder el plan."),
      { url: d.panelUrl, label: "Revisar mi suscripción" },
    ),
    text: [
      `El cobro de ${d.currency} ${d.amount} del plan ${d.planName} fue rechazado.`,
      "Tu cuenta sigue funcionando; revisá el medio de pago.",
      "",
      `Revisar: ${d.panelUrl}`,
    ].join("\n"),
  };
}

export interface NuevaTasacionData {
  agencyName: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  propertyType: string;
  panelUrl: string;
}

/**
 * Aviso de solicitud de tasación a la inmobiliaria asignada.
 *
 * El nombre, la dirección y la localidad los escribe un propietario desde un
 * formulario abierto: pasan por `escapar` como todo lo que viene de afuera.
 */
export function nuevaTasacion(to: string, d: NuevaTasacionData): EmailMessage {
  const ubicacion = [d.address, d.city].filter(Boolean).join(", ");

  return {
    to,
    subject: `Nueva solicitud de tasación en ${d.city}`,
    html: layout(
      "Recibiste una solicitud de tasación",
      p(
        `<strong>${escapar(d.name)}</strong> pidió una tasación de un inmueble en <strong>${escapar(ubicacion)}</strong>.`,
      ) +
        p(`Tipo de propiedad: ${escapar(d.propertyType)}`) +
        p(`Contacto: ${escapar(`${d.email} · ${d.phone}`)}`),
      { url: d.panelUrl, label: "Ver la solicitud" },
    ),
    text: [
      `${d.name} pidió una tasación de un inmueble en ${ubicacion}.`,
      `Tipo de propiedad: ${d.propertyType}`,
      `Contacto: ${d.email} · ${d.phone}`,
      "",
      `Ver la solicitud: ${d.panelUrl}`,
    ].join("\n"),
  };
}
