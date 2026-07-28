import { env } from "@/config/env";
import { emailProvider } from "@/shared/services/email";
import { NotificationsService } from "./notifications.service";

export {
  NotificationsService,
  noopNotifier,
  type Notifier,
} from "./notifications.service";
export type {
  BienvenidaData,
  NuevoLeadData,
  PagoData,
} from "./templates";

/** Instancia compartida por auth, inquiries y billing. */
export const notifier = new NotificationsService(emailProvider);

/** URLs del panel que van en los correos. */
export const panelUrls = {
  leads: `${env.FRONTEND_URL}/panel/leads`,
  panel: `${env.FRONTEND_URL}/panel`,
  suscripcion: `${env.FRONTEND_URL}/panel/suscripcion`,
};
