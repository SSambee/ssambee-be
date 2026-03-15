import { ErrorRequestHandler } from 'express';
import { HttpException } from '../err/http.exception.js';
import {
  isBetterAuthError,
  mapBetterAuthErrorToHttpException,
} from '../err/better-auth.exception.js';

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  console.error('error message', error);

  // Better Auth 에러 처리
  if (isBetterAuthError(error)) {
    const httpException = mapBetterAuthErrorToHttpException(error);
    if (httpException) {
      error = httpException;
    }
  }

  if (error instanceof HttpException) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  return res.status(500).json({
    success: false,
    message: 'Internal Server Error',
  });
};
