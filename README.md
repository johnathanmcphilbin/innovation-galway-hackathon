# Innovation Galway × ElevenLabs

Site for the student hackathon at PorterShed, Galway, on Saturday 21 November 2026, 10am–6pm.

Project submissions are written to the Hack Club YSWS Airtable table. The site does not take sign-ups. There is no Slack integration.

## Stack

Node 22, Express, server-rendered HTML, and `pg`. One process. `npm start` listens on `PORT` (default 3000). On boot, if `DATABASE_URL` is set, the app runs an idempotent migration (`CREATE TABLE IF NOT EXISTS`, unique index on email).

## Pages

- `/` submission page: challenge, how to ship the project, partners
- `/submit` project submission, written to Airtable
- `/admin` password gate and a link to review submissions in Airtable. `ADMIN_PASSWORD` protects it.

## Environment

Copy `.env.example` to `.env` for local development.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Optional. If set, boot still runs the existing idempotent migration. The site does not read or write sign-ups. |
| `AIRTABLE_API_KEY` | Token that can create records in this base and nowhere else. |
| `AIRTABLE_BASE_ID` | `appInkJZdtOT67t8l` |
| `AIRTABLE_TABLE` | `YSWS Project Submission` (table id `tbloBMHxgUSH9zrkg`) |
| `ADMIN_PASSWORD` | Password for `/admin`. |
| `PORT` | Set by Orchard. Local default is `3000`. |

The submission writer sends only these existing fields: Code URL, Playable URL, First Name, Last Name, Email, Screenshot (`[{ url }]`), Description, GitHub Username, Birthday, How did you hear about this?, What are we doing well?, How can we improve?, the optional address fields, and Justification - Additional Justification (team members, how ElevenLabs was used, and how the project helps young people). It does not write `Automation - Last Updated At`, any other `Automation-*` or `Loops-*` field, formula fields, or `Optional - Override` fields. It does not create tables or fields, and it does not read or write any other base.

Address fields are omitted when the student leaves them blank. Screenshot is an attachment built from a hosted image URL the student pastes. This server does not store uploads.

## Local

```bash
npm install
npm test
npm start
```

The site runs without `DATABASE_URL`. Submit needs the Airtable variables. If `DATABASE_URL` is set, remote Postgres (including Orchard) is connected with TLS; `sslmode` in the URL is handled by the app. The old `signups` table is left in place and is not used.

## Deploy on Hack Club Orchard

Orchard builds this repository from GitHub with Railpack. Node 22 is pinned in `package.json` (`engines`) and `.node-version`.

1. Push the repository to GitHub and create one Orchard service from it. Start command: `npm start`. The process listens on `0.0.0.0` and `PORT`.
2. Set `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID=appInkJZdtOT67t8l`, `AIRTABLE_TABLE=YSWS Project Submission`, and `ADMIN_PASSWORD`. `DATABASE_URL` is optional.
3. Deploy. If `DATABASE_URL` is set, the existing migration runs on boot and can run again safely. It does not drop tables.
4. Open the service URL. `/admin` links to the submission review base: https://airtable.com/appInkJZdtOT67t8l/tbloBMHxgUSH9zrkg

Rate limits are in memory, which matches a single service. `/signup` redirects to the home page.
