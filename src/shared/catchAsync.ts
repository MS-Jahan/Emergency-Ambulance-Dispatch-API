import type { NextFunction, Request, RequestHandler, Response } from 'express'

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>

export const catchAsync =
  (fn: AsyncRequestHandler): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next)
  }
