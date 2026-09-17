export const validateCreateSalary = (req, res, next) => {
  const { employeeId, basicSalary, effectiveFrom } = req.body;
  const errors = [];

  if (!employeeId) errors.push('employeeId is required');
  if (basicSalary === undefined || basicSalary === null) {
    errors.push('basicSalary is required');
  } else if (typeof basicSalary !== 'number' || basicSalary < 0) {
    errors.push('basicSalary must be a non-negative number');
  }
  if (!effectiveFrom) errors.push('effectiveFrom date is required');

  ['hra', 'allowances', 'deductions'].forEach((field) => {
    const value = req.body[field];
    if (value !== undefined && (typeof value !== 'number' || value < 0)) {
      errors.push(`${field} must be a non-negative number`);
    }
  });

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }
  next();
};

export const validateUpdateSalary = (req, res, next) => validateCreateSalary(req, res, next);