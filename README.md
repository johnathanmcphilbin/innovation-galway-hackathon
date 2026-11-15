# Innovation Galway × ElevenLabs

Site for the student hackathon at PorterShed, Galway, on Saturday 21 November 2026, 10am–6pm.

Sign-ups are stored in Postgres. Project submissions are written to the Hack Club YSWS Airtable table. There is no Slack integration, and sign-ups are not sent to Airtable.

## Stack

Node 22, Express, server-rendered HTML, and `pg`. One process. `npm start` listens on `PORT` (default 3000). On boot, if `DATABASE_URL` is set, the app runs an idempotent migration (`CREATE TABLE IF NOT EXISTS`, unique index on email).

## Pages

- `/` event page: challenge, schedule (marked TBA), partners, FAQ, location
- `/signup` registration, stored in Postgres
- `/submit` project submission, written to Airtable if the email already exists in Postgres
- `/admin` sign-up count, list, and CSV export. Password is `ADMIN_PASSWORD`. Submissions are reviewed in Airtable.

## Environment

Copy `.env.example` to `.env` for local development.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string from Hack Club Orchard. Sign-ups only. |
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

The marketing pages load without a database. Sign-up and the admin list need `DATABASE_URL`. Submit also needs the Airtable variables. Remote Postgres (including Orchard) is connected with TLS; `sslmode` in the URL is handled by the app.

## Deploy on Hack Club Orchard

Orchard builds this repository from GitHub with Railpack. Node 22 is pinned in `package.json` (`engines`) and `.node-version`.

1. Push the repository to GitHub and create one Orchard service from it. Start command: `npm start`. The process listens on `0.0.0.0` and `PORT`.
2. Add the Orchard Postgres database and set `DATABASE_URL` on the service to that database's connection string.
3. Set `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID=appInkJZdtOT67t8l`, `AIRTABLE_TABLE=YSWS Project Submission`, and `ADMIN_PASSWORD`.
4. Deploy. The migration runs on boot and can run again safely.
5. Open the service URL. `/admin` lists sign-ups and exports CSV. Review projects in Airtable: https://airtable.com/appInkJZdtOT67t8l/tbloBMHxgUSH9zrkg

Rate limits are in memory, which matches a single service. Sign-up emails are stored in lowercase and rejected when they already exist.
