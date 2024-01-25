import { formatError } from "../library/errors";
import { validate } from "uuid";

// Pagination and ID validation middleware
export const validatePaginationAndId = (idField) => {
  return async (req, res, next) => {
    const { page = "1", pageSize = "100" } = req.params;
    const id = req.params[idField];

    const pageInt = parseInt(page);
    if (!Number.isInteger(pageInt) || pageInt <= 0) {
      return next(formatError(400, "Page must be a positive integer"));
    }

    const pageSizeInt = parseInt(pageSize);
    if (!Number.isInteger(pageSizeInt) || pageSizeInt <= 0) {
      return next(formatError(400, "Page size must be a positive integer"));
    }

    if (!id) {
      return next(formatError(400, `Must include the ${idField}`));
    }

    const isValid = validate(id);
    if (isValid) {
      return next(formatError(400, "Invalid ID format"));
    }

    req.pagination = {
      page: pageInt,
      pageSize: pageSizeInt,
      offset: (pageInt - 1) * pageSizeInt,
    };
    next();
  };
};
