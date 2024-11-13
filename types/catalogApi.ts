export type ResponseObject<T = any> =
  | {
      success: true;
      data?: T;
    }
  | {
      error: string;
      success: false;
    };
