export const EVENT_DATE = "2026-11-21";

export const EVENT = {
  name: "Innovation Galway × ElevenLabs",
  tagline: "Building for the youth",
  line: "A hackathon for students, by students.",
  dateLabel: "Saturday 21 November 2026",
  dateISO: EVENT_DATE,
  start: "10:00",
  end: "18:00",
  venue: "PorterShed",
  street: "15 Market St",
  city: "Galway",
  eircode: "H91 TCX3",
  mapUrl:
    "https://maps.google.com/?q=PorterShed%2C+15+Market+Street%2C+Galway%2C+H91+TCX3",
  challenge:
    "How can technology create better opportunities and experiences for young people?",
  hosts: ["Eve Kennedy", "Cristian Rotariu"],
  partners: [
    {
      name: "Innovation Galway",
      note: "Innovation Ireland",
      logo: "/art/partners/innovation-ireland.png",
      logoWidth: 114,
      logoHeight: 186,
    },
    {
      name: "ElevenLabs",
      logo: "/art/partners/elevenlabs.svg",
      logoWidth: 694,
      logoHeight: 90,
    },
    { name: "IdeasLab" },
    {
      name: "PorterShed",
      logo: "/art/partners/portershed.png",
      logoWidth: 1892,
      logoHeight: 407,
    },
  ],
  airtableBaseId: "appInkJZdtOT67t8l",
  airtableTableId: "tbloBMHxgUSH9zrkg",
  airtableTableName: "YSWS Project Submission",
};

export const TSHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

export function airtableReviewUrl(env = process.env) {
  const base = String(env.AIRTABLE_BASE_ID || EVENT.airtableBaseId).trim();
  if (base === EVENT.airtableBaseId) {
    return `https://airtable.com/${EVENT.airtableBaseId}/${EVENT.airtableTableId}`;
  }
  return `https://airtable.com/${encodeURIComponent(base)}`;
}
