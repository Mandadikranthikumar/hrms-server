import express from 'express';
import {
  EmpLogin,
  googleLogin,
  EmpOtp,
  EmpRegister,
  resetPassword,
  verifyOtp,
  getProfile,
  updateUserProfile,
  changePassword,
  passkey,
  getAllUsers
} from "../controllers/userController.js";
import { verifyToken, authorizeRoles as authorize } from '../middlewares/authMiddleware.js';

const route = express.Router();

route.post('/passkey',passkey);
route.post("/newEmp", EmpRegister);
route.post("/Emplogin", EmpLogin);

route.post("/googleLogin", googleLogin);
route.post("/sendOtp", EmpOtp);
route.post("/verifyOtp", verifyOtp);
route.post("/resetpassword", resetPassword);
route.put("/change-password", verifyToken, changePassword);

route.get("/profile", verifyToken, getProfile);
route.put("/profile", verifyToken, updateUserProfile);

route.get("/users", verifyToken, authorize("Admin", "HR"), getAllUsers);


route.get("/admin-only", verifyToken, authorize("Admin"), (req, res) => {
    res.status(200).json({ success: true, message: "Welcome Admin!", user: req.user });
});

route.get("/hr-only", verifyToken, authorize("Admin", "HR"), (req, res) => {
    res.status(200).json({ success: true, message: "Welcome HR/Admin!", user: req.user });
});

route.get("/employee-only", verifyToken, authorize("Admin", "HR", "Employee"), (req, res) => {
    res.status(200).json({ success: true, message: "Welcome Employee!", user: req.user });
});

export default route;