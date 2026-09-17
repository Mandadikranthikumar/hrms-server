import Notification from "../models/Notification.js";
import transporter from "../config/mail.js";

/**
 * Create a new in-app notification for a specific recipient.
 */
export const createNotification = async ({
  recipient,
  type,
  message,
  relatedLeave = null,
  relatedTask = null,
  relatedAssignment = null,
  attachmentUrl = "",
  link = "",
}) => {
  try {
    const notif = await Notification.create({
      recipient,
      type,
      message,
      relatedLeave,
      relatedTask,
      relatedAssignment,
      attachmentUrl,
      link,
    });
    return notif;
  } catch (err) {
    console.error("createNotification error:", err.message);
    return null;
  }
};

/**
 * Send an email using the existing Nodemailer transporter.
 * Fails silently if credentials are not configured — does NOT throw.
 */
export const sendLeaveEmail = async ({ to, subject, html }) => {
  if (!process.env.EMAIL || !process.env.EMAIL_PASS) {
    // Email credentials not configured — skip silently
    console.warn("sendLeaveEmail: EMAIL credentials not set in .env — skipping email.");
    return;
  }

  try {
    await transporter.sendMail({
      from: `HRMS Notifications <${process.env.EMAIL}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    // Non-fatal — log but don't crash the main request
    console.error("sendLeaveEmail error:", err.message);
  }
};

export const sendEmail = sendLeaveEmail;

/**
 * Send an email notification to HR when an employee submits work/deliverable.
 */
export const sendTaskSubmissionEmail = async ({
  to,
  taskTitle,
  employeeName,
  employeeEmail,
  submissionText,
  attachmentUrl,
  version = 1,
}) => {
  if (!process.env.EMAIL || !process.env.EMAIL_PASS) {
    console.warn("sendTaskSubmissionEmail: EMAIL credentials not set in .env — skipping email.");
    return;
  }

  try {
    const linkHtml = attachmentUrl
      ? `<p><strong>Deliverable Link:</strong> <a href="${attachmentUrl}" target="_blank" style="color: #4f46e5; font-weight: bold; text-decoration: underline;">${attachmentUrl}</a></p>`
      : `<p><strong>Deliverable Link:</strong> <em>No link provided</em></p>`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background: #ffffff;">
        <h2 style="color: #4f46e5; margin-top: 0; display: flex; align-items: center; gap: 8px;">
          🚀 Task Submission for Review (v${version})
        </h2>
        <p style="font-size: 15px; color: #334155;">
          Employee <strong>${employeeName}</strong> (${employeeEmail}) has submitted a deliverable for the task:
        </p>
        <div style="background: #f8fafc; border-left: 4px solid #4f46e5; padding: 14px 18px; border-radius: 6px; margin: 16px 0;">
          <h3 style="margin: 0 0 6px 0; color: #1e293b; font-size: 16px;">${taskTitle}</h3>
          <p style="margin: 0; font-size: 14px; color: #64748b;"><strong>Submission Notes:</strong></p>
          <p style="margin: 4px 0 0 0; font-size: 14px; color: #334155; white-space: pre-wrap;">${submissionText}</p>
        </div>
        ${linkHtml}
        <p style="font-size: 13px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
          Please log in to your HRMS portal to review this submission, request rework, or approve the task.
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: `HRMS Task System <${process.env.EMAIL}>`,
      to,
      subject: `New Task Submission: ${taskTitle} by ${employeeName}`,
      html,
    });
  } catch (err) {
    console.error("sendTaskSubmissionEmail error:", err.message);
  }
};

/**
 * Send an email notification to employee when assigned a new task.
 */
export const sendTaskAssignmentEmail = async ({
  to,
  taskTitle,
  employeeName,
  assignedBy,
  deadline,
  priority,
  description,
  notes,
}) => {
  if (!process.env.EMAIL || !process.env.EMAIL_PASS) {
    console.warn("sendTaskAssignmentEmail: EMAIL credentials not set in .env — skipping email.");
    return;
  }

  try {
    const formattedDeadline = deadline
      ? new Date(deadline).toLocaleDateString("en-US", {
          weekday: "short",
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "Not specified";

    const priorityBadgeColor =
      priority === "HIGH" || priority === "CRITICAL"
        ? "#dc2626"
        : priority === "MEDIUM"
        ? "#f59e0b"
        : "#10b981";

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background: #ffffff;">
        <h2 style="color: #4f46e5; margin-top: 0; display: flex; align-items: center; gap: 8px;">
          📋 New Task Assigned
        </h2>
        <p style="font-size: 15px; color: #334155;">
          Hello <strong>${employeeName || "Team Member"}</strong>,
        </p>
        <p style="font-size: 15px; color: #334155;">
          A new task has been assigned to you by <strong>${assignedBy || "HR Manager"}</strong>.
        </p>
        <div style="background: #f8fafc; border-left: 4px solid #4f46e5; padding: 16px 20px; border-radius: 6px; margin: 18px 0;">
          <h3 style="margin: 0 0 10px 0; color: #1e293b; font-size: 17px;">${taskTitle}</h3>
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #475569; line-height: 1.5;">${description || "No description provided."}</p>
          <div style="display: flex; gap: 16px; margin-top: 12px; font-size: 13px; color: #64748b;">
            <span><strong>Priority:</strong> <span style="color: ${priorityBadgeColor}; font-weight: 700;">${priority || "MEDIUM"}</span></span>
            &bull;
            <span><strong>Deadline:</strong> <strong style="color: #1e293b;">${formattedDeadline}</strong></span>
          </div>
          ${notes ? `<p style="margin: 12px 0 0 0; font-size: 13px; color: #64748b;"><strong>Notes:</strong> ${notes}</p>` : ""}
        </div>
        <p style="font-size: 14px; color: #334155;">
          Please log in to your HRMS portal to review the requirements, track your progress, and submit deliverables before the deadline.
        </p>
        <p style="font-size: 13px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
          HRMS Task Monitoring System &bull; Automated notification
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: `HRMS Task System <${process.env.EMAIL}>`,
      to,
      subject: `New Task Assigned: ${taskTitle} [${priority || "MEDIUM"}]`,
      html,
    });
  } catch (err) {
    console.error("sendTaskAssignmentEmail error:", err.message);
  }
};

/**
 * Send an email notification to employee when their task submission is reviewed.
 */
export const sendTaskReviewEmail = async ({
  to,
  taskTitle,
  employeeName,
  reviewerName,
  decision,
  comments,
}) => {
  if (!process.env.EMAIL || !process.env.EMAIL_PASS) {
    console.warn("sendTaskReviewEmail: EMAIL credentials not set in .env — skipping email.");
    return;
  }

  try {
    const isApproved = decision === "APPROVED";
    const headerColor = isApproved ? "#16a34a" : "#ea580c";
    const headerIcon = isApproved ? "✅" : "🔄";
    const headerTitle = isApproved ? "Task Approved!" : "Rework Requested on Task";

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background: #ffffff;">
        <h2 style="color: ${headerColor}; margin-top: 0; display: flex; align-items: center; gap: 8px;">
          ${headerIcon} ${headerTitle}
        </h2>
        <p style="font-size: 15px; color: #334155;">
          Hello <strong>${employeeName || "Team Member"}</strong>,
        </p>
        <p style="font-size: 15px; color: #334155;">
          Your deliverable for <strong>${taskTitle}</strong> was reviewed by <strong>${reviewerName || "Reviewer"}</strong>.
        </p>
        <div style="background: #f8fafc; border-left: 4px solid ${headerColor}; padding: 14px 18px; border-radius: 6px; margin: 16px 0;">
          <p style="margin: 0 0 6px 0; font-size: 13px; color: #64748b;"><strong>Review Feedback:</strong></p>
          <p style="margin: 0; font-size: 14px; color: #1e293b; white-space: pre-wrap;">${comments || "No comments provided."}</p>
        </div>
        <p style="font-size: 14px; color: #334155;">
          ${
            isApproved
              ? "Great work! This task has been marked as COMPLETED."
              : "Please make the requested updates in the HRMS portal and resubmit your deliverable for review."
          }
        </p>
        <p style="font-size: 13px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
          HRMS Task Monitoring System &bull; Automated notification
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: `HRMS Task System <${process.env.EMAIL}>`,
      to,
      subject: `${headerTitle}: ${taskTitle}`,
      html,
    });
  } catch (err) {
    console.error("sendTaskReviewEmail error:", err.message);
  }
};


