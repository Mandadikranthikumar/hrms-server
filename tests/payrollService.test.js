import { calculatePayroll } from '../services/payrollService.js';

describe('calculatePayroll', () => {
  test('calculates correctly with full attendance (no proration needed)', () => {
    const result = calculatePayroll({
      basicSalary: 50000, hra: 20000, allowances: 5000, deductions: 2000, bonus: 0,
      daysPresent: 22, totalWorkingDays: 22,
    });
    expect(result.grossSalary).toBe(75000);
    expect(result.netSalary).toBe(73000);
  });

  test('prorates basic/hra/allowances correctly with partial attendance', () => {
    const result = calculatePayroll({
      basicSalary: 22000, hra: 11000, allowances: 0, deductions: 0, bonus: 0,
      daysPresent: 20, totalWorkingDays: 22,
    });
    expect(result.proratedBasic).toBe(20000);
    expect(result.proratedHra).toBe(10000);
  });

  test('adds bonus at full value regardless of attendance', () => {
    const result = calculatePayroll({
      basicSalary: 22000, hra: 0, allowances: 0, deductions: 0, bonus: 5000,
      daysPresent: 11, totalWorkingDays: 22,
    });
    expect(result.grossSalary).toBe(16000);
  });

  test('applies deductions at full value regardless of attendance', () => {
    const result = calculatePayroll({
      basicSalary: 22000, hra: 0, allowances: 0, deductions: 3000, bonus: 0,
      daysPresent: 11, totalWorkingDays: 22,
    });
    expect(result.netSalary).toBe(8000);
  });

  test('throws an error when totalWorkingDays is 0', () => {
    expect(() => calculatePayroll({
      basicSalary: 50000, hra: 0, allowances: 0, deductions: 0, bonus: 0,
      daysPresent: 0, totalWorkingDays: 0,
    })).toThrow('totalWorkingDays must be greater than 0');
  });

  test('throws an error when daysPresent exceeds totalWorkingDays', () => {
    expect(() => calculatePayroll({
      basicSalary: 50000, hra: 0, allowances: 0, deductions: 0, bonus: 0,
      daysPresent: 25, totalWorkingDays: 22,
    })).toThrow('daysPresent cannot exceed totalWorkingDays');
  });
});