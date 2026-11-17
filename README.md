# Innovation Galway × ElevenLabs

Site for the student hackathon at PorterShed, Galway, on Saturday 21 November 2026, 10am–6pm.

Project submissions are saved in Postgres. The site has no admin area and no login. Review happens outside the site. The Airtable helpers in `src/airtable.js` are kept but no public route calls them. The site does not take sign-ups. There is no Slack integration.

## Stack

Node 22, Express, server-rendered HTML, and `pg`. One process. `npm start` listens on `PORT` (default 3000). On boot, if `DATABASE_URL` is set, the app runs an idempotent migration (`CREATE TABLE IF NOT EXISTS` for the old `signups` table and for `submissions`).

## Pages

- `/` and `/submit` are the same page: the event title and the project form. Screenshot upload or a public image URL. The project is saved in Postgres.
- Any other public path redirects to `/submit`. `/submit/thanks` is the success page.

## Environment

Copy `.env.example` to `.env` for local development.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Required for submissions and review. Postgres connection string. The old `signups` table is left in place and is not used. |
| `AIRTABLE_API_KEY` | Token that can create records in this base and nowhere else. |
| `AIRTABLE_BASE_ID` | `appInkJZdtOT67t8l` |
| `AIRTABLE_TABLE` | `YSWS Project Submission` (table id `tbloBMHxgUSH9zrkg`) |
| `PORT` | Set by Orchard. Local default is `3000`. |

`/submit` does not call Airtable. It stores the form, and any uploaded screenshot (PNG, JPEG, WebP, or GIF, 5 MB, checked by magic bytes, memory only), in `submissions` with status `pending`. No route on the site reads submissions back out, shows a screenshot, or writes to Airtable. Any `/admin` path returns 404.

Address fields are omitted when the student leaves them blank. Birthday is required. A project name is optional; the review form prefills it from the name they typed, or from the GitHub repository name.

On approve, the writer sends these fields and no others:

- Code URL, Playable URL, How did you hear about this?, What are we doing well?, How can we improve?, First Name, Last Name, Email, Description, GitHub Username, Birthday
- Address (Line 1), Address (Line 2), City, State / Province, Country, ZIP / Postal Code, when present
- Screenshot, either as an uploaded attachment or `[{ url }]` when the student pasted a link and did not upload a file
- Optional - Override Hours Spent (the approved hours)
- Optional - Override Hours Spent Justification:

```
Innovation Galway review: Approved (<project name>)
Reviewer: <reviewer name>
Reviewed at: <M/D/YYYY, h:mm:ss AM/PM>
Feedback to participant: <reviewer feedback>
```

Reviewed at uses Europe/Dublin.

- Justification - Hackatime Project Name(s) + Date Range(s)
- Justification - Submitter Hackatime ID, when present
- Justification - Lapse Links, comma-separated
- Justification - Specific Technical Features
- Justification - Deflation Justification
- Justification - Alternate Tracking Method
- Justification - Additional Justification (team members, ElevenLabs use, youth impact, extra notes)

It does not write Automation - Unified Justification (a formula Airtable fills from the other fields), Automation - Submit to Unified YSWS, Automation - Error, Automation - First Submitted At, Automation - Last Updated At, Automation - YSWS Record ID, or any Loops field. It does not create tables or fields, and it does not read or write any other base.

## Local

```bash
npm install
npm test
npm start
```

Submit and review need `DATABASE_URL`. Approve also needs the Airtable variables. Remote Postgres (including Orchard) is connected with TLS; `sslmode` in the URL is handled by the app. The migration can run again safely. It does not drop tables.

## Deploy on Hack Club Orchard

Orchard builds this repository from GitHub with Railpack. Node 22 is pinned in `package.json` (`engines`) and `.node-version`.

1. Push the repository to GitHub and create one Orchard service from it. Start command: `npm start`. The process listens on `0.0.0.0` and `PORT`.
2. Set `DATABASE_URL`, `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID=appInkJZdtOT67t8l`, `AIRTABLE_TABLE=YSWS Project Submission`.
3. Deploy. The migration runs on boot and can run again safely. It does not drop tables.
4. Open the service URL. The YSWS table is https://airtable.com/appInkJZdtOT67t8l/tbloBMHxgUSH9zrkg

Rate limits are in memory, which matches a single service. Paths other than the form and its thanks page redirect to `/submit`.
