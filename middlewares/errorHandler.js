// server/middlewares/errorHandler.js

// Centralized error handler — catches errors thrown anywhere in the app
// Must be added LAST in server.js, after all routes
export const errorHandler = (err, req, res, next) => {
  console.error('ERROR:', err.message); // log for debugging

  const statusCode = err.statusCode || 500;

  return res.status(statusCode).json({
    success: false,
    message: err.message || 'Something went wrong on the server',
  });
};

// Handles requests to routes that don't exist (404)
export const notFoundHandler = (req, res, next) => {
  return res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`,
  });
};