/**
 * Pure calculation function — no database calls, easy to unit test.
 */
export const calculatePayroll = ({
  basicSalary, hra = 0, allowances = 0, deductions = 0, bonus = 0,
  daysPresent, totalWorkingDays,
}) => {
  if (!totalWorkingDays || totalWorkingDays <= 0) {
    throw new Error('totalWorkingDays must be greater than 0');
  }
  if (daysPresent < 0) {
    throw new Error('daysPresent cannot be negative');
  }
  if (daysPresent > totalWorkingDays) {
    throw new Error('daysPresent cannot exceed totalWorkingDays');
  }

  const ratio = daysPresent / totalWorkingDays;
  const proratedBasic = basicSalary * ratio;
  const proratedHra = hra * ratio;
  const proratedAllowances = allowances * ratio;
  const grossSalary = proratedBasic + proratedHra + proratedAllowances + bonus;
  const netSalary = grossSalary - deductions;

  const round2 = (n) => Math.round(n * 100) / 100;

  return {
    proratedBasic: round2(proratedBasic),
    proratedHra: round2(proratedHra),
    proratedAllowances: round2(proratedAllowances),
    grossSalary: round2(grossSalary),
    netSalary: round2(netSalary),
  };
};