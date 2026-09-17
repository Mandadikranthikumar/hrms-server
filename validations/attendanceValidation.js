
export const validateCheckIn = (req, res, next) => {
  const { location, remarks } = req.body;

 
  if (location && typeof location !== "string") {
    return res.status(400).json({
      success: false,
      message: "Location must be a string.",
    });
  }

  if (remarks && typeof remarks !== "string") {
    return res.status(400).json({
      success: false,
      message: "Remarks must be a string.",
    });
  }

  next();
};


export const validateCheckOut = (req, res, next) => {
  // No validation required because employeeId comes from JWT
  next();
};


export const validateHistory = (req, res, next) => {
  // No validation required because employeeId comes from JWT
  next();
};

export const validateMonthlyAttendance = (req, res, next) => {
  const { year, month } = req.params;

  if (!year || !month) {
    return res.status(400).json({
      success: false,
      message: "Year and Month are required.",
    });
  }

  next();
};