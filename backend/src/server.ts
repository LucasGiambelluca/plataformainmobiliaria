import { app } from "@/app";
import { env } from "@/config/env";
import { logger } from "@/config/logger";
import { connectDatabase, disconnectDatabase } from "@/config/database";
import { crearApagador } from "@/shared/proceso/apagado";

async function bootstrap(): Promise<void> {
  await connectDatabase();
  logger.info("Conexión a PostgreSQL establecida");

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(
      `🚀 Backend escuchando en http://${env.HOST}:${env.PORT} (${env.NODE_ENV})`,
    );
  });

  const { apagar } = crearApagador(server, disconnectDatabase);

  // Un rechazo que nadie esperó. Node la mata desde la v15, y el criterio por
  // defecto está bien para un sistema que maneja plata: si una promesa se
  // rechaza y nadie la atiende, puede haber un bug que dejó el mundo en un
  // estado raro, y seguir como si nada es peor que reiniciar.
  //
  // Lo que cambia acá es CÓMO se muere. Antes era una guillotina: el proceso
  // caía en el acto, sin escribir qué lo causó y cortando en el medio lo que
  // estuviera pasando. Ahora se loguea el motivo completo y se cierra como si
  // hubiera llegado un SIGTERM, o sea esperando a que terminen las peticiones en
  // vuelo. Un pago a medio confirmar deja de ser una víctima colateral.
  //
  // El código de salida es 1, para que systemd lo reinicie y el health check
  // vuelva a responder solo.
  process.on("unhandledRejection", (motivo) => {
    logger.error(
      { motivo, razon: (motivo as Error)?.stack ?? String(motivo) },
      "Promesa rechazada sin manejar; se cierra el proceso",
    );
    void apagar("unhandledRejection", 1);
  });

  // Excepción sin capturar: acá el estado del proceso es desconocido, así que
  // no hay drain posible. Se loguea todo y se sale de una. Lo que no se hace es
  // seguir corriendo, que es la forma de dejar datos a medias sin saberlo.
  process.on("uncaughtException", (err) => {
    logger.fatal({ err, stack: err.stack }, "Excepción sin capturar; saliendo");
    process.exit(1);
  });

  process.on("SIGINT", () => void apagar("SIGINT", 0));
  process.on("SIGTERM", () => void apagar("SIGTERM", 0));
}

bootstrap().catch((err) => {
  logger.error({ err }, "Fallo al iniciar el servidor");
  process.exit(1);
});
