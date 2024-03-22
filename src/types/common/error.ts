export type errorResponse<T> = {
  message: string;
  error?: T;
};
