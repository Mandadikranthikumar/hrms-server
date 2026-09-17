import nodemailer from "nodemailer";
import dotenv from 'dotenv'
dotenv.config()

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: (process.env.EMAIL || "").trim(),
        pass: (process.env.EMAIL_PASS || "").replace(/\s+/g, ""),
    },
});

export default transporter;
