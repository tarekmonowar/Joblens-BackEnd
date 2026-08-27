import { Response } from "express";

interface TMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
}

interface TResponse<T> {
  statusCode: number;
  success: boolean;
  message?: string;
  data: T;
  meta?: TMeta;
}

export const sendResponse = <T>(res: Response, data: TResponse<T>) => {
  const payload: {
    success: boolean;
    data: T;
    meta?: TMeta;
  } = {
    success: data.success,
    data: data.data,
  };

  if (data.meta) {
    payload.meta = data.meta;
  }

  res.status(data.statusCode).json(payload);
};
