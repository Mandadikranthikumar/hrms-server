/**
 * Formats API success responses consistently.
 */
export const successResponse = (res, statusCode = 200, message = "Success", data = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Formats API error responses consistently.
 */
export const errorResponse = (res, statusCode = 500, message = "An error occurred", errors = null) => {
  const response = {
    success: false,
    message,
  };

  if (errors) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
};
