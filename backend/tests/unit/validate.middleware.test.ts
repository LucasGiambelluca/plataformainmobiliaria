import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { validate } from "@/shared/middleware/validate";
import { ValidationError } from "@/shared/errors";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

function run(body: unknown) {
  const req = { body } as Request;
  const next = jest.fn() as NextFunction;
  validate(schema)(req, {} as Response, next);
  return { req, next };
}

describe("validate middleware", () => {
  it("pasa y reemplaza body por los datos parseados (sin campos extra)", () => {
    const { req, next } = run({
      email: "a@b.com",
      password: "12345678",
      extra: "fuera",
    });
    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ email: "a@b.com", password: "12345678" });
  });

  it("body inválido → ValidationError con detalle por campo", () => {
    const { next } = run({ email: "no-es-email", password: "corta" });
    const err = (next as jest.Mock).mock.calls[0][0] as ValidationError;
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "email" }),
        expect.objectContaining({ field: "password" }),
      ]),
    );
  });
});
