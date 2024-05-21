export const formatError = (status: number, message: string): Error => {
  const error = new Error(message);
  // @ts-ignore
  error.status = status;
  return error;
};
