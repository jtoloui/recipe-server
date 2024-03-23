export type errorResponse<T> = {
  message: string;
  error?: T;
};

export type cause = {
  status: number;
  message: any;
};
