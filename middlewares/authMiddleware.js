import jwt from "jsonwebtoken";
import UserModel from "../models/UserModel.js";

export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Resilient multi-tenancy: if token has no organizationId and user is not Super Admin, fetch from DB
    const userId = req.user?.id || req.user?._id;
    const userRole = normalizeRole(req.user?.role);
    if (!req.user.organizationId && userRole !== "super_admin" && userId) {
      try {
        const dbUser = await UserModel.findById(userId).select("organizationId role");
        if (dbUser?.organizationId) {
          req.user.organizationId = dbUser.organizationId;
        }
        if (dbUser?.role) {
          req.user.role = dbUser.role;
        }
      } catch (dbErr) {
        console.error("verifyToken DB lookup error:", dbErr.message);
      }
    }

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

export const protect = verifyToken;

export const normalizeRole = (role) => {
  if (!role) return "";
  const r = String(role).trim().toLowerCase();
  if (r === "super_admin" || r === "superadmin" || r === "super admin") return "super_admin";
  if (r === "admin") return "admin";
  if (
    r === "hr" ||
    r === "hr manager" ||
    r === "hr_manager" ||
    r === "human resources" ||
    r === "human_resources"
  ) {
    return "hr_manager";
  }
  if (r === "employee") return "employee";
  return r;
};

export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    const userRole = normalizeRole(req.user?.role);
    const allowedRoles = roles.map((r) => normalizeRole(r));

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }
    next();
  };
};

export const authorizeSuperAdmin = (req, res, next) => {
  const userRole = normalizeRole(req.user?.role);
  if (userRole !== "super_admin") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Super Admin authorization required.",
    });
  }
  next();
};
