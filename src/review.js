export const DEFAULT_REVIEWER_NAME = "Johnathan Mc philbin";
export const HACKATHON_WHEN = "21 November 2026";

export function formatJustification({ teamMembers, elevenLabsUse, youthImpact }) {
  return [
    `Team members:\n${String(teamMembers).trim()}`,
    `How ElevenLabs was used:\n${String(elevenLabsUse).trim()}`,
    `How this helps young people:\n${String(youthImpact).trim()}`,
  ].join("\n\n");
}

export function hackatimeProjectLine(projectName) {
  return `${projectName}, Innovation Galway hackathon, ${HACKATHON_WHEN}`;
}

export function defaultAlternateTracking(hackatimeId) {
  if (typeof hackatimeId === "string" && hackatimeId.trim()) return "";
  return `In-person attendance at the PorterShed hackathon, ${HACKATHON_WHEN}.`;
}

/** Europe/Dublin. Built from parts so the space before AM/PM is a normal space. */
export function formatReviewedAt(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Dublin",
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("month")}/${pick("day")}/${pick("year")}, ${pick("hour")}:${pick("minute")}:${pick("second")} ${pick("dayPeriod")}`;
}

export function formatOverrideJustification({ projectName, reviewerName, reviewedAt, feedback }) {
  return [
    `Innovation Galway review: Approved (${projectName})`,
    `Reviewer: ${reviewerName}`,
    `Reviewed at: ${formatReviewedAt(reviewedAt)}`,
    `Feedback to participant: ${feedback}`,
  ].join("\n");
}

function hoursToInput(value) {
  if (value == null || value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return String(number);
}

export function prefillReview(submission) {
  const saved = Boolean(submission.reviewedAt);
  const projectName = submission.projectName || "";
  return {
    project_name: projectName,
    reviewer_name: saved && submission.reviewerName ? submission.reviewerName : DEFAULT_REVIEWER_NAME,
    approved_hours: saved ? hoursToInput(submission.approvedHours) : "",
    reviewer_feedback: saved ? submission.reviewerFeedback || "" : "",
    just_hackatime_projects: saved
      ? submission.justHackatimeProjects || ""
      : hackatimeProjectLine(projectName),
    just_hackatime_id: saved ? submission.justHackatimeId || "" : submission.hackatimeId || "",
    just_lapse_links: saved ? submission.justLapseLinks || "" : "",
    just_technical_features: saved ? submission.justTechnicalFeatures || "" : submission.elevenLabsUse || "",
    just_deflation: saved ? submission.justDeflation || "" : "",
    just_alternate_tracking: saved
      ? submission.justAlternateTracking || ""
      : defaultAlternateTracking(submission.hackatimeId),
    just_additional: saved ? submission.justAdditional || "" : formatJustification(submission),
  };
}
