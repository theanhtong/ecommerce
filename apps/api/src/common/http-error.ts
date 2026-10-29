import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';

type Params = Record<string, string | number>;

// Clients translate errors by `code`. A fixed message is its own code, slugged ('Shop not found' is
// shop_not_found); a message that carries values names its code and values through `coded`.
export const coded = (code: string, message: string, params?: Params) => ({
  code,
  message,
  params,
});

export const errorCode = (message: unknown) =>
  Array.isArray(message)
    ? 'validation_failed'
    : typeof message === 'string'
      ? message
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '')
      : undefined;

@Catch(HttpException)
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const statusCode = exception.getStatus();
    const response = exception.getResponse();
    const body: Record<string, unknown> =
      typeof response === 'string' ? { message: response } : { ...response };
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(statusCode)
      .json({
        ...body,
        statusCode,
        code: body.code ?? errorCode(body.message),
      });
  }
}
