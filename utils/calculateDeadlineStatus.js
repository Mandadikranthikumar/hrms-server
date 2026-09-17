/**
 * Calculates dynamic deadline status and classification.
 * Rule: OVERDUE is a monitoring condition, not a stored status enum.
 * - If COMPLETED:
 *     completedAt <= deadline -> COMPLETED_ON_TIME
 *     completedAt > deadline  -> COMPLETED_LATE
 * - If not COMPLETED:
 *     now > deadline          -> OVERDUE
 *     now is same day as deadline -> DUE_TODAY
 *     now < deadline          -> UPCOMING
 */
export function calculateDeadlineStatus(assignment) {
  if (!assignment || !assignment.deadline) {
    return {
      isOverdue: false,
      deadlineCategory: "UPCOMING",
      daysDiff: 0,
    };
  }

  const now = new Date();
  const deadline = new Date(assignment.deadline);
  const isCompleted = assignment.status === "COMPLETED";
  const completedDate = assignment.completedAt
    ? new Date(assignment.completedAt)
    : assignment.updatedAt
    ? new Date(assignment.updatedAt)
    : now;

  if (isCompleted) {
    const isCompletedOnTime = completedDate <= deadline;
    return {
      isOverdue: false,
      deadlineCategory: isCompletedOnTime ? "COMPLETED_ON_TIME" : "COMPLETED_LATE",
      isCompletedOnTime,
      isCompletedLate: !isCompletedOnTime,
      completedAt: completedDate,
    };
  }

  // Calculate day difference
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDeadline = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  const diffTime = startOfDeadline.getTime() - startOfToday.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const isOverdue = now > deadline;
  let deadlineCategory = "UPCOMING";

  if (isOverdue) {
    deadlineCategory = "OVERDUE";
  } else if (diffDays === 0) {
    deadlineCategory = "DUE_TODAY";
  } else {
    deadlineCategory = "UPCOMING";
  }

  return {
    isOverdue,
    deadlineCategory,
    diffDays,
  };
}