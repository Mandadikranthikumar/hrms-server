import express from "express";
import {
    getCandidates,
    getCandidateById,
    createCandidate,
    updateCandidate,
    deleteCandidate,
    getCandidateFiltersMeta,
} from "../controllers/candidateController.js";
import { verifyToken, authorizeRoles } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(verifyToken);

router.get("/meta/filters", getCandidateFiltersMeta);
router.get("/", getCandidates);
router.get("/:id", getCandidateById);
router.post("/", authorizeRoles("Admin", "HR", "HR Manager"), createCandidate);
router.put("/:id", authorizeRoles("Admin", "HR", "HR Manager"), updateCandidate);
router.delete("/:id", authorizeRoles("Admin", "HR", "HR Manager"), deleteCandidate);

export default router;