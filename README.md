# Innovation Galway × ElevenLabs

Site for the student hackathon at PorterShed, Galway, on Saturday 21 November 2026, 10am–6pm.

Project submissions are saved in Postgres. Teens sign in with Hack Club Auth before the form. There is no GitHub username field and no Hackatime ID field. Organisers review at `/admin`. The Airtable helper in `src/airtable.js` runs only when an organiser approves and `SYNC_APPROVED_TO_AIRTABLE=true`. The old sign-up form is not used. There is no Slack integration.

## Stack

Node 22, Express, server-rendered HTML, and `pg`. One process. `npm start` listens on `PORT` (default 3000). On boot, if `DATABASE_URL` is set, the app runs an idempotent migration (`CREATE TABLE IF NOT EXISTS` for the old `signups` table and for `submissions`, then `ALTER TABLE submissions ALTER COLUMN github_username DROP NOT NULL` and `ADD COLUMN IF NOT EXISTS hackclub_id`).

## Pages

- `/` and `/submit` ask the teen to sign in with Hack Club, then show the project form. Screenshot upload or a public image URL. The project is saved in Postgres with their Hack Club id.
- `/auth/login` sends the browser to Hack Club Auth. Someone without an account makes one on that same flow.
- `/auth/callback` is the OAuth redirect URI.
- `/submit/thanks` confirms the project was saved and that an organiser will review it.
- `/admin` lists submissions for organisers. Anyone else is sent to sign in, or gets 403.
- Any other public path redirects to `/submit`.

## Environment

Copy `.env.example` to `.env` for local development.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Required for submissions and review. Postgres connection string. The old `signups` table is left in place and is not used. |
| `AIRTABLE_API_KEY` | Token that can create records in this base and nowhere else. |
| `AIRTABLE_BASE_ID` | `appInkJZdtOT67t8l` |
| `AIRTABLE_TABLE` | `YSWS Project Submission` (table id `tbloBMHxgUSH9zrkg`) |
| `PORT` | Set by Orchard. Local default is `3000`. |
| `HCA_CLIENT_ID` | Hack Club Auth client id. |
| `HCA_CLIENT_SECRET` | Hack Club Auth client secret. |
| `HCA_REDIRECT_URI` | Must match a redirect URI on the Hack Club Auth app exactly. Production: `https://galway.hackclub.com/auth/callback`. |
| `SESSION_SECRET` | Signs the session cookie. Falls back to `HCA_CLIENT_SECRET` when unset. |
| `ADMIN_EMAILS` | Extra organiser emails, comma-separated. `johnny@hackclub.com` is always an organiser. |
| `SYNC_APPROVED_TO_AIRTABLE` | Set to `true` to send an approval to the YSWS table. Off when unset. |
| `HCA_SCOPES` | Optional. Default is `openid profile email name birthdate address`. |

`/submit` does not call Airtable. It stores the form, and any uploaded screenshot (PNG, JPEG, WebP, or GIF, 5 MB, checked by magic bytes, memory only), in `submissions` with status `pending`. `/admin` is the only page that reads submissions back. It writes to Airtable only when `SYNC_APPROVED_TO_AIRTABLE=true`.

Address line 1, city, country, and ZIP or postcode are required. Address line 2 and state or province are optional. Birthday is required. A project name is optional; a blank one uses the name from the code link. Name, email, birthday, and address are filled from Hack Club Auth when those claims are present, and the teen can edit them.

Register this redirect URI on the Hack Club Auth app, character for character:

`https://galway.hackclub.com/auth/callback`

The sign-in request asks for `openid profile email name birthdate address`. Birthday and address are HQ-only scopes, so the app needs the `hq_official` trust level. A community app that cannot request those scopes will be rejected by Hack Club Auth until `HCA_SCOPES` is narrowed.

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
