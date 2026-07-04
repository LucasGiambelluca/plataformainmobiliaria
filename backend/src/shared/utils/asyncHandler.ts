import type { NextFunction, Request, Response, RequestHandler } from "express";

// Envuelve handlers async para propagar rejections al error handler de Express.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
