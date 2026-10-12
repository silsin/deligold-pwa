import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { TradeError } from './errors';

/**
 * Turns domain errors into the `{ success, error }` envelope the PWA already
 * expects (see src/utils/api.js in delly-pwa), so both this API and the older
 * Next.js routes behave identically on failure.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof TradeError) {
      res.status(exception.status).json({ success: false, error: exception.message });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? 'خطای درخواست');
      res.status(status).json({
        success: false,
        error: Array.isArray(message) ? message.join('، ') : message,
      });
      return;
    }

    // Anything else is a bug — log the stack, tell the client nothing useful.
    this.logger.error(
      'unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    res.status(500).json({ success: false, error: 'خطای سرور' });
  }
}
