import express from "express";

import {
    verifyToken,
    authorizeRoles
} from "../middlewares/authMiddleware.js";

import {
    createRole,
    getAllRoles,
    getPublicRoles,
    getRoleById,
    updateRole,
    deleteRole
} from "../controllers/roleController.js";


const router = express.Router();

router.post(
    "/",
    verifyToken,
    authorizeRoles("Admin"),
    createRole
);

router.get(
    "/",
    verifyToken,
    getAllRoles
);

router.get("/public/list", getPublicRoles);

router.get(
    "/:id",
    verifyToken,
    getRoleById
);

router.put(
    "/:id",
    verifyToken,
    authorizeRoles("Admin"),
    updateRole
);

router.delete(
    "/:id",
    verifyToken,
    authorizeRoles("Admin"),
    deleteRole
);


export default router;