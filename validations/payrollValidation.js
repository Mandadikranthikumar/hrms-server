export const validateGeneratePayroll = (req, res, next) => {
  const { employeeId, month, year, daysPresent, totalWorkingDays, bonus } = req.body;

  if (!employeeId || !/^[0-9a-fA-F]{24}$/.test(employeeId)) {
    return res.status(400).json({ success: false, message: 'A valid employeeId is required' });
  }
  if (!month || isNaN(month) || month < 1 || month > 12) {
    return res.status(400).json({ success: false, message: 'Month must be a number between 1 and 12' });
  }
  if (!year || isNaN(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ success: false, message: 'Year must be a valid number between 2000 and 2100' });
  }
  if (daysPresent === undefined || daysPresent === null || isNaN(daysPresent) || daysPresent < 0) {
    return res.status(400).json({ success: false, message: 'daysPresent must be a non-negative number' });
  }
  if (!totalWorkingDays || isNaN(totalWorkingDays) || totalWorkingDays < 1) {
    return res.status(400).json({ success: false, message: 'totalWorkingDays must be a number of at least 1' });
  }
  if (Number(daysPresent) > Number(totalWorkingDays)) {
    return res.status(400).json({ success: false, message: 'daysPresent cannot exceed totalWorkingDays' });
  }
  if (bonus !== undefined && bonus !== null && (isNaN(bonus) || bonus < 0)) {
    return res.status(400).json({ success: false, message: 'bonus must be a non-negative number' });
  }

  next();
};