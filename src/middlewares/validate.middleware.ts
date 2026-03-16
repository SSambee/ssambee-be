import { z } from 'zod';
import { BadRequestException } from '../err/http.exception.js';
import { RequestHandler } from 'express';

/**
 * @param {z.ZodSchema<any>} schema 검사할 Zod 스키마
 * @param {'body' | 'query' | 'params'} type 검사할 요청 데이터의 위치
 * @returns {Function: RequestHandler} Express 미들웨어 함수
 */
export const validate =
  (
    schema: z.ZodSchema,
    type: 'body' | 'query' | 'params' = 'body',
  ): RequestHandler =>
  async (req, res, next) => {
    try {
      const dataToValidate = req[type] || {};
      const validatedData = await schema.parseAsync(dataToValidate);
      try {
        req[type] = validatedData;
      } catch {
        Object.defineProperty(req, type, { value: validatedData });
      }
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.log('error.issues', error.issues);
        const formattedErrors = error.issues.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
          location: type,
        }));
        next(
          new BadRequestException(
            formattedErrors[0].message,
            formattedErrors as never[],
          ),
        );
      } else {
        next(error);
      }
    }
  };
