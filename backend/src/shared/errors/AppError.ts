// Jerarquía de errores de aplicación. El error handler global los traduce a respuestas HTTP.

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode = 500,
    code = "INTERNAL_ERROR",
    details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Solicitud inválida", details?: unknown) {
    super(message, 400, "BAD_REQUEST", details);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Error de validación", details?: unknown) {
    super(message, 422, "VALIDATION_ERROR", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "No autenticado") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Acceso denegado") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso no encontrado") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflicto", details?: unknown) {
    super(message, 409, "CONFLICT", details);
  }
}

/**
 * Escritura intentada desde una sesión de suplantación. Tiene code propio para
 * que el frontend lo distinga de un 403 por rol y muestre el mensaje correcto.
 */
export class ReadOnlySessionError extends AppError {
  constructor() {
    super(
      "Estás en modo soporte: la sesión es de solo lectura.",
      403,
      "IMPERSONATION_READ_ONLY",
    );
  }
}

export class LimitExceededError extends AppError {
  constructor(resource: string, message?: string) {
    super(
      message ?? `Se alcanzó el límite del plan para: ${resource}`,
      402,
      "LIMIT_EXCEEDED",
      { resource },
    );
  }
}
