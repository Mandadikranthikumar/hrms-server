import { getOrCreateLeaveBalance } from "../services/leaveBalanceService.js";

// Get logged-in employee's own leave balance
export const getMyLeaveBalance = async (req, res) => {
  try {
    const employeeId = req.user.id;
    const balance = await getOrCreateLeaveBalance(employeeId);

    return res.status(200).json({
      success: true,
      balance,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// Get leave balance by employee ID (Admin & HR only)
export const getEmployeeLeaveBalance = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const balance = await getOrCreateLeaveBalance(employeeId);

    return res.status(200).json({
      success: true,
      balance,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
