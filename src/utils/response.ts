import { Response } from 'express';

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
  timestamp: string;
}

export function sendSuccess<T>(res: Response, data: T, message?: string, statusCode: number = 200) {
  const response: ApiResponse<T> = {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
  return res.status(statusCode).json(response);
}

export function sendError(res: Response, message: string = 'Internal server error', statusCode: number = 500, errorDetails?: any) {
  return res.status(statusCode).json({
    success: false,
    message,
    errorDetails: process.env.NODE_ENV === 'development' ? errorDetails : undefined,
    timestamp: new Date().toISOString(),
  });
}
