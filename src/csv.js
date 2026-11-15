import { ageOn } from "./validate.js";

function cell(value) {
  const text = value == null ? "" : String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replaceAll('"', '""')}"`;
}

export function signupsToCsv(rows) {
  const header = [
    "id",
    "created_at",
    "first_name",
    "last_name",
    "email",
    "date_of_birth",
    "age_on_event",
    "school",
    "dietary_needs",
    "allergies",
    "tshirt_size",
    "guardian_name",
    "guardian_email",
    "guardian_phone",
    "photo_consent",
    "how_heard",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    const dob = String(row.date_of_birth).slice(0, 10);
    lines.push(
      [
        row.id,
        new Date(row.created_at).toISOString(),
        row.first_name,
        row.last_name,
        row.email,
        dob,
        ageOn(dob),
        row.school,
        row.dietary_needs,
        row.allergies,
        row.tshirt_size,
        row.guardian_name,
        row.guardian_email,
        row.guardian_phone,
        row.photo_consent ? "yes" : "no",
        row.how_heard,
      ]
        .map(cell)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
