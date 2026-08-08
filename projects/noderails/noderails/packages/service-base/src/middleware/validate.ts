import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { ValidationError } from '@noderails/common';

type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Express middleware that validates req[target] against a Zod schema.
 * On success, replaces req[target] with the parsed (and potentially transformed) data.
 */
export function validate(schema: ZodSchema, target: ValidationTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const messages = result.error.errors.map(
        (e) => `${e.path.join('.')}: ${e.message}`,
      );
      next(new ValidationError(messages.join('; '), result.error.errors));
      return;
    }

    // Replace with parsed data (applies transforms, defaults, etc.)
    (req as unknown as Record<string, unknown>)[target] = result.data;
    next();
  };
}
