import e, { Response } from 'express';
import { Logger } from 'winston';
import { errorResponse } from '../types/common/error';

interface ResponseHandlerConfig {
  logger: Logger;
}

interface Handler {
  sendSuccess<T>(res: Response, data: T, statusCode: number): Response;
  sendError<T>(
    res: Response<errorResponse<T>>,
    statusCode: number,
    message: string,
    error?: T,
  ): Response;
}

class ResponseHandler implements Handler {
  private logger: Logger;

  constructor(config: ResponseHandlerConfig) {
    this.logger = config.logger;
  }

  /**
   * Send a success response.
   * @param res - The Express response object.
   * @param data - The response data.
   * @param statusCode - The HTTP status code (default: 200).
   */
  sendSuccess<T>(
    res: Response<T>,
    data: T,
    statusCode: number = 200,
  ): Response {
    this.logger.debug('Sending success response', { statusCode, data });
    return res.status(statusCode).json(data);
  }

  /**
   * Send a success through non JSON response.
   * @param res - The Express response object.
   * @param data - The response data.
   * @param statusCode - The HTTP status code (default: 200).
   */
  sendSuccessNonJSON<T>(
    res: Response<T>,
    data: T,
    statusCode: number = 200,
  ): Response {
    this.logger.debug('Sending success response', { statusCode, data });
    return res.status(statusCode).send(data);
  }

  /**
   * Send an error response.
   * @param res - The Express response object.
   * @param statusCode - The HTTP status code (default: 500).
   * @param message - The error message.
   * @param error - The error object.
   */
  sendError<T>(
    res: Response<errorResponse<T>>,
    statusCode: number = 500,
    message: string,
    error?: T,
  ): Response {
    this.logger.error('Sending error response', { statusCode, message });
    return res.status(statusCode).json({
      message,
      error,
    });
  }

  /**
   * Send an error through non JSON response.
   * @param res - The Express response object.
   * @param statusCode - The HTTP status code (default: 500).
   * @param message - The error message.
   */
  sendErrorNonJSON(
    res: Response,
    statusCode: number = 500,
    message: string,
  ): Response {
    this.logger.error('Sending error response', { statusCode, message });
    return res.status(statusCode).send(message);
  }
}

export default ResponseHandler;
