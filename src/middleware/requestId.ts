import { NextFunction, Request, Response } from 'express';
import * as uuid from 'uuid';

function assignId(req: Request, res: Response, next: NextFunction) {
  const id = uuid.v4();

  req.id = id;
  next();
}

export default assignId;
