# Submission note log (draft)

Draft written by the agent. The "What I verified" column is filled from what Remy reported
in the session; Remy should correct it before submitting.

The plan had one stage per day from Nov 19 to Nov 23. Because of travel, the four build
stages were all done on Nov 19 and the verification stage on Nov 20, each one after a plan
was proposed and approved.

| Stage | What the agent did | What I verified |
|---|---|---|
| Before the build (Nov 18) | Nothing. | Called each integration by hand and wrote down the real response shapes: OpenWeatherMap forecast has no wind, geocoding finds towns and not beaches, Open-Meteo peak period is null, email accepts bcc. Saved the Open-Meteo fixtures. |
| 1. Spots and permissions | Wrote the four schemas with role permissions, the owner-only town search, the Spots page, and tests. Closed two scaffold routes that let any signed-in user spend the owner's credits or trigger cron. | Added a spot on the live site. Signed in with a second account and confirmed it could read spots but saw no add or delete controls. Asked for feet, mph and compass checkboxes in place of the first version's metric units and degrees. |
| 2. Scoring and the nightly forecast | Wrote the scoring rules, the Open-Meteo fetch, the forecast job, the daily cron task and the owner-only Refresh now with a 10-minute cooldown, all tested against the fixtures. | Pressed Refresh now locally and on the live site and read the verdict cards against the reasons. |
| 3. Sessions, RSVP and presence | Made the job propose a session, added the session card with live RSVP and "here now", and a two-browser test. | Created the two test accounts myself (the agent never saw the passwords). Checked RSVPs from a second account. |
| 4. Summary, confirm and email | Added the Haiku summary with a fallback, the confirm action that sends one email, the captain controls, and error and stale-forecast states. Made no paid calls. | Confirmed a session on the live site and received exactly one email. Found that no summary ever appeared. |
| 5. Verification (Nov 20) | Found the cause of the missing summary in the production logs (the 150-token limit was used up by the model's reasoning), fixed it, ran the smoke and two-user suites, scanned the git history for secrets and wrote the README. Confirmed in the logs that the cron task ran at 6 PM Pacific and wrote both calls. | Deployed the fix, pressed Refresh now and read the summary against the verdicts. Checked usage: 496 of 500 credits left before the fix was tested. |

## Things the agent got wrong and how they were caught

- **Summary token limit.** The agent set `max_tokens` to 150 without allowing for reasoning
  tokens. Mocked tests passed. It was caught by my live check and diagnosed from the logs.
- **Units and direction inputs.** The first Spots form followed the spec's metres, km/h and
  degrees. I changed it to feet, mph and compass points after trying it.
- **Boundary maths.** `6 * 1.2` is `7.1999…` in floating point, which made near misses on
  the exact limit fail. The agent's own boundary tests caught it.

## Not done

- The Google Calendar integration. The confirmation email has an "Add to Google Calendar"
  link instead.
- Editing a spot (delete and add again).
