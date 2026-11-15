# Innovation Galway × ElevenLabs: design direction

Status: a proposal for build and preview only. Nothing is announced in any Slack, and nothing ships until Johnny OKs it.
Base: PR #1, branch `cursor/innovation-galway-site-e14e` @ `0e025e5`. The patch changes only `src/render.js` (markup and copy), `public/styles.css`, `public/fonts/` and the new `public/art/`. Forms, field names, routes, validation, and the Airtable and Postgres code are unchanged. All 19 tests in `npm test` pass with the patch applied.

## The idea in one line
Keep the poster's night-navy and blue so it still reads as the same event, then make it feel like people made it: hand-inked stickers, a marker-yellow button, and plain, friendly copy. The anchor image is a **Galway hooker** (the city's traditional sailing boat) whose red sail carries an **inked voice waveform**. That gives Galway and ElevenLabs in one drawing, and the sail is Hack Club red.

What made the current build feel "not Hack Club-y":
- It's centred and symmetrical, with perfect vector globes and waves, a halftone made with `radial-gradient`, and a mask.
- Synthesized oblique type: Big Shoulders has no italic, so the browser fakes it.
- Grey-blue "quiet" text everywhere, giant all-caps FAQ rows, and a uniform hairline-ruled list on every section.
- No people-made marks and no sense of place. Nothing says Galway apart from the address.

## Type
| Role | Face | Licence | Use |
| --- | --- | --- | --- |
| Display | **Barlow Condensed ExtraBold Italic** (800i) | SIL OFL 1.1 (Barlow Project Authors; covered by the existing `OFL-barlow.txt`) | Hero title, h2, buttons, legends, address, times. A true italic that matches the poster's slanted condensed caps, replacing the faked oblique. |
| UI labels | **Barlow Condensed Bold** (700) | OFL | Nav, t-shirt chips, "Required" tags, table headers |
| Body | **Barlow** 400/500/600 (already self-hosted) | OFL | Everything you read |
| Hand lettering | **Hershey Simplex** single-stroke, hand-inked (jittered per letter, round thick stroke, off-register second pass) | MIT (Hershey-Fonts package); output is paths, so no font ships | Sticker text and the hero note only. Never live text. |

Big Shoulders Display is removed. New woff2 files are subset to Latin plus Latin Extended-A (`barlow-condensed-800-italic.woff2` 29.9 KB, `barlow-condensed-700.woff2` 27.8 KB) and self-hosted, as the CSP (`font-src 'self'`) requires. Why it doesn't look AI: no Inter, Geist, Space Grotesk or Bricolage, no fake italics, and the hand-made lettering is drawn rather than a "handwriting" webfont.

Scale (18px base; tokens in `tokens.css`):
- `--step-4` hero title: clamp(3.4rem, 11vw, 6rem), line-height 0.84, capped at 6rem
- `--step-3` section h2: clamp(2.4rem, 5.2vw, 3.75rem), line-height 0.9
- `--step-2` tagline and legends: clamp(1.75rem, 3.2vw, 2.25rem)
- `--step-1` lede, FAQ questions, h3: 1.375rem (22px), Barlow 600, sentence case
- `--step-0` body: 1.125rem (18px), line-height 1.6, measure 64ch
- `--step--1` hints and footer: 0.9375rem (15px)
- All caps only for display italic and short labels. FAQ questions are now sentence case, so they're readable.

## Colour
| Token | Hex | Role | Contrast |
| --- | --- | --- | --- |
| `--night` | `#070a14` | Page background (the poster's black-navy) | |
| `--night-2` | `#10172b` | Form fields, chips | Paper text on it 16.0:1 |
| `--rule` | `#2a3a5c` | 2px rules and field borders on night | |
| `--paper` | `#eef3fb` | Light sections; headings and strong text on night (blue-white, not beige) | On night 17.7:1 |
| `--ink` | `#0b0f1a` | Text on paper, yellow and blue | On paper 17.2:1, on sun 13.0:1 |
| `--body` | `#dbe5f3` | Body copy on night (blue-tinted, not grey) | 15.5:1 |
| `--blue` | `#8ec4ff` | The poster's blue: links, the ×, date line and lines on night | 10.8:1 |
| `--blue-ink` | `#24569a` | Links on paper | 6.6:1 |
| `--sun` | `#ffcf3d` | Primary buttons, marker underline, focus ring, selection. **Ink text only** | |
| `--red` | `#ec3750` | Hack Club red: the hooker's sail and the "Under 19s" sticker. Never behind body text | |
| `--danger` | `#ffb4bd` | Errors on night | 11.8:1 |

Text on colour is always solid ink or solid paper. There are no alpha-tinted text colours, gradients, glows or blur.

## Layout, section by section
**Header (all pages).** Wordmark in display italic on the left, nav on the right, and "Sign up" as the only yellow pill. On mobile the nav becomes one horizontally scrolling row instead of wrapping onto three lines.

**Home: hero.** Asymmetric 7/5 grid. On the left: the title (Innovation / Galway × / ElevenLabs), "Building for the youth" with an inked yellow marker underline, the lede, one blue date line (10am to 6pm · PorterShed, Galway), then the buttons and the facts. The eyebrow date above the H1 is gone. On the right: the hooker sticker, tilted −3°, with "Under 19s" (red) and "Free entry" (yellow) stickers slapped on its corners, plus a hand-lettered note: "Free ElevenLabs credits for everyone!" One inked globe peeks in from the top right as a nod to the poster. On mobile: title, copy and full-width buttons first, then the sticker at about 21rem. The note is hidden there and the globe is smaller.

**The brief (paper section).** The challenge question is the H2, in ink on paper. Next to it is a yellow speech-bubble sticker with a waveform. Then the two facts paragraphs and a new **"Stuck for an idea? Steal one"** list of four concrete ElevenLabs ideas (see Copy). On desktop it's two columns (6/5); on mobile it stacks.

**Schedule (night).** On desktop a sticky H2 sits on the left, with the time list on the right. Times are in yellow display italic, and TBA is in blue.

**Partners (paper).** "Made possible by". Names run in a wrapping row of display italic for now. **Replace each name with the partner's real logo file, in single-colour ink.** Get them from Eve and Cristian, the ElevenLabs brand kit, and Innovation Ireland, PorterShed and IdeasLab. Don't redraw or approximate any logo.

**FAQ (night).** Sticky H2 on the left, and the questions on the right as 22px sentence-case rows. A yellow "+" turns into "×" when a row is open. The native triangle marker is gone.

**Location.** "Find us at PorterShed", the address in big display italic, and an outlined "Open the map" button.

**Footer.** A full-width inked waveform rule (`wave-rule.svg`), then hosts, date and Admin.

**Sign up and Submit.** Desktop keeps the sticky intro column, with the voice-bubble sticker replacing the vector globe. Fields are boxed: 2px border, 10px radius, `--night-2` fill, yellow caret, blue focus border, and a pink border when invalid. That makes them easier to hit on phones than the current underline-only inputs. T-shirt sizes are chunky chips that turn into a tilted yellow sticker when picked. The submit button is yellow. It's left-aligned at 14rem minimum on desktop and full-width on mobile.

**Status and admin pages.** These inherit the tokens. There are no layout changes.

## Illustration and assets (all in `art/`, also in the patch under `public/art/`)
Hand-written SVG built by `src/art.py`. It reuses the HackCast ink helpers (`/workspace/hackcast-sampler-retro/src/ink.py`, `hand.py`). There are no filters or gradients, and the lettering is paths.
- `hooker-sticker.svg`: a Galway hooker on a die-cut paper sticker, with a red sail carrying a voice waveform, blue sea and two gulls. The hero image.
- `sticker-under19.svg`, `sticker-free.svg`: round stickers with hand-inked lettering.
- `note-credits.svg`: a hand-lettered "FREE ELEVENLABS CREDITS FOR EVERYONE!" with a yellow arrow. Decorative; the same fact is live text.
- `voice-bubble.svg`: a yellow speech bubble with an inked waveform. Used in the brief and on the form pages.
- `globe-inked.svg`: the poster's wireframe globe, redrawn by hand in poster blue.
- `wave-rule.svg`: an inked waveform divider. `marker-underline.svg`: the yellow marker swipe.
- Next ideas, if wanted: the Spanish Arch or the Long Walk's coloured houses as a second sticker for the location section, and photos from the day.

All images are `aria-hidden` or have `alt=""`, are served from `/art` (CSP `img-src 'self'` is fine), and have no inline styles, so the CSP holds.

## Copy tone
Talk to a 15-year-old like a friend who runs the event. Write short, concrete second-person sentences in Irish English (organisers, programme). Don't use hype words, "AI-powered", forced contrasts, or a dash in every line. Say what people can do. Buttons are actions in the first person or imperative.

| Was | Now |
| --- | --- |
| Sign up (hero) | **Sign up, it's free** |
| Submit a project (hero) | **Submit your project** |
| Sign up (form button) | **Sign me up** |
| Submit project (form button) | **Send in my project** |
| (lede) A hackathon for students, by students. | A hackathon for students, by students. **One day of building things that talk, listen and help, at PorterShed in Galway.** |
| Everyone who takes part gets free ElevenLabs credits. | Everyone who takes part gets free ElevenLabs credits, **so your project can speak, listen, translate or sing.** |
| Partners | **Made possible by** |
| PorterShed (location h2) | **Find us at PorterShed** |
| (new) | **Stuck for an idea? Steal one:** a study buddy that quizzes you out loud before the Leaving Cert; an audio guide to Galway in the voices of the people who live here; a game where the characters actually talk back; a tool that helps someone who finds it hard to speak up in class. |

Kept word for word because the tests check them: "Building for the youth", "A hackathon for students, by students", the challenge question, "Schedule TBA", "free ElevenLabs credits", PorterShed, H91 TCX3, the hosts and IdeasLab.
For the organisers to confirm before launch: the idea list, and any "bring a laptop and charger" line. I did not add facts that aren't already on the site.

## Do
- Keep night-navy and poster blue so the site still matches the poster and the LinkedIn post.
- Use hand-inked stickers, at most three per view and always slightly tilted.
- Make yellow the single "do this" colour (sign up, submit, focus).
- Use real partner logos only, in single-colour ink on paper.
- Use solid colours, 2px rules and a 10px radius everywhere.
- Use one motion moment: buttons tilt 1.5° on hover, and the FAQ "+" rotates. Both respect reduced motion.

## Don't
- No gradients, `radial-gradient` halftones, glows, blur or glassmorphism.
- No eyebrow or kicker above a heading, and no centred hero with three feature cards.
- No icon packs or emoji as icons. If an icon is needed, draw it in the same inked line.
- No grey or alpha-tinted text on colour, and no white text on yellow or red.
- No faked italics or synthesized bold. No new fonts outside the table above.
- No copying of other Hack Club sites' signature motifs: no Orpheus, no flag, no mushrooms, gears or forests. The Hack Club flag could be added only if Johnny wants Hack Club branding on this co-branded event.
- No redrawn or "inspired-by" partner logos.
- Never mention, announce or link this site in any Slack.

## Files
- `innovation-galway-design.patch`: `git apply` onto `0e025e5`. Binary-safe; covers render.js, styles.css, fonts and art.
- `styles.css`: the full new stylesheet. `tokens.css`: the `:root` tokens on their own.
- `art/*.svg` and the generator `src/art.py` (rebuild with `PYTHONHASHSEED=0 python3 art.py` from `src/`).
- `mockups/`: `before-*` and `after-*` for home, signup and submit at desktop (1440) and mobile (390 @2x), both full page and `-fold`, plus side-by-sides named `compare-*.png`.
- `repo/`: a local clone with the patch applied in the working tree. Nothing has been committed or pushed.
