# Dawn Patrol

A small app for a surf crew. Every evening it checks tomorrow's dawn forecast for the crew's
spots, gives each spot a verdict (IT'S ON, MAYBE or NO-GO) with the reasons, and proposes a
session. The crew taps in or out, and the captain confirms the spot and meet time with one
email.

Live: <https://dawn-patrol.app.space>

Built on [DeepSpace](https://docs.deep.space) (Cloudflare Workers and Durable Objects).

## The captain flow

1. **Add spots** on the Spots page (up to 6). Search a town to get starting coordinates,
   adjust them to the break, then set the rules: swell height in feet, minimum period,
   swell directions, tides and wind.
2. **The forecast runs at 6 PM Pacific every day.** The captain can also press **Refresh now**
   (limited to once every 10 minutes).
3. **Home shows one card per spot** with the verdict, the five checks behind it and a
   two-sentence summary on the best spot.
4. **A session card proposes the best spot** for tomorrow at 06:00. Crew members tap
   **I'm in** or **I'm out**, and everyone sees the lists and who is on the page update live.
5. **The captain picks the final spot and time under "Make the call" and presses Confirm and
   email crew.** One email goes out with an "Add to Google Calendar" link, and the controls
   are replaced by "Confirmation email sent".

<!-- TODO before submitting: add screenshots to docs/screenshots/ and uncomment.
![Adding a spot](docs/screenshots/1-add-spot.png)
![Verdict cards after Refresh now](docs/screenshots/2-verdicts.png)
![Session card with RSVPs](docs/screenshots/3-session.png)
![After confirming](docs/screenshots/4-confirmed.png)
-->

## Roles

| Role | Who | Can do |
|---|---|---|
| Captain | The app owner (DeepSpace `admin`) | Everything below, plus add and delete spots, Refresh now, confirm and email |
| Crew | Any other signed-in user (`member`) | Read spots, calls and sessions; create and change their own RSVP |
| Signed out | Anyone | See the landing page only |

Calls and sessions are written only by the server. Nobody can edit them from the browser.

## How a verdict is decided

The verdict comes from plain code in [src/lib/score.ts](src/lib/score.ts), not from the AI.
It averages the forecast over the dawn window (05:00 to 09:00 at the spot) and runs five
checks against the spot's rules:

| Check | Passes when | Near miss |
|---|---|---|
| Swell height | Between the spot's minimum and optional maximum (feet) | Within 20% of the limit |
| Swell period | At or above the minimum (seconds) | Within 20% |
| Swell direction | Inside a ticked compass point (N, NE, E, SE, S, SW, W, NW) | Up to 15° outside |
| Tide at 07:00 | In a ticked band (low, mid or high third of the day's range) | Within 10% of the range |
| Wind | At or under the limit (mph), or blowing from a ticked offshore direction | Within 20% over |

- **IT'S ON:** all five pass.
- **MAYBE:** four pass and the fifth is a near miss.
- **NO-GO:** anything else. Missing data counts as a fail.

"Tomorrow" is worked out in the spot's own timezone.

## Data and integrations

| Used | For | Cost |
|---|---|---|
| Open-Meteo Marine API | Swell height, period, direction and sea level | Free, no key |
| Open-Meteo Forecast API | Wind speed and direction | Free, no key |
| `openweathermap/geocoding` | Town search when adding a spot | Paid, captain only |
| `anthropic/chat-completion` | Two-sentence summary, once per forecast run | Paid, server only |
| `email/send` | One confirmation email per session | Paid, captain only |

Left out, and why:

- **`openweathermap/forecast`:** its response has no wind, so wind comes from Open-Meteo.
- **Open-Meteo `swell_wave_peak_period`:** it comes back null. The mean period is used.
- **The Google Calendar integration and invite files:** the email service takes no
  attachments, and a per-user Google connection is a lot of machinery for one event. The
  email carries a plain "Add to Google Calendar" link instead, which needs no sign-in and
  costs nothing.

Cost controls:

- Every paid call runs on the server, in the nightly cron task or an owner-only action.
  The integration proxy route also refuses developer-billed calls from anyone but the owner.
- The summary always uses `claude-haiku-5-5` with a capped `max_tokens`. If the call fails,
  the card shows the reasons without a summary. Nothing retries.
- The email is sent once per session. A failed send is never retried automatically; the
  captain presses the button again.
- Test accounts (`@deepspace.test`) are never emailed.

## The main tradeoff

Verdicts come from fixed rules the captain sets for each spot, and the AI only puts the
result into words. That makes every verdict explainable, testable with fixture data and
nearly free to run. The cost is that the rules are only as good as the captain's local
knowledge: the app cannot suggest rules for a new spot, and a simple pass or fail on five
averages misses things a surfer would see, such as a swell that fills in late in the window.

## Known limits

- Marine models are coarse close to the coast and the tide is modelled sea level, not a
  tide table. Treat the call as a guide.
- A spot cannot be edited. Delete it and add it again.
- The summary appears on the best spot's card only. It compares all spots in its text.
- The captain always receives the confirmation email, whether in or out, because they are
  its main recipient. Crew who tapped in are on bcc.
- The nightly run is at 6 PM Pacific for every spot, wherever the spot is.
- The calendar link has no timezone and lasts two hours. Google uses the reader's own
  timezone, which is right for a crew that lives near the spot.

## Run it locally

```sh
npm install
npx deepspace auth login
npx deepspace dev start     # http://localhost:5173
```

Use Chrome for local development. Safari drops the sign-in cookie on `http://localhost`.

## Tests

```sh
npm run test:unit           # scoring, forecast parsing, actions, schemas
npx deepspace test run smoke
npx deepspace test run e2e  # two-user RSVP and presence tests; needs two test accounts
```

The tests never spend credits. The paid integrations are mocked, and the Open-Meteo responses
come from the JSON files in [tests/fixtures/](tests/fixtures/).

## Where things are

| Path | What |
|---|---|
| [src/schemas/](src/schemas/) | The four collections: spots, calls, sessions, rsvps, with permissions |
| [src/lib/score.ts](src/lib/score.ts) | The verdict rules |
| [src/lib/forecast.ts](src/lib/forecast.ts) | Open-Meteo fetch and unit conversion |
| [src/server/refresh-calls.ts](src/server/refresh-calls.ts) | The forecast job: score every spot, save calls, propose a session |
| [src/server/summarize.ts](src/server/summarize.ts) | The AI summary with its fallback |
| [src/lib/calendar-link.ts](src/lib/calendar-link.ts) | The "Add to Google Calendar" link |
| [src/cron.ts](src/cron.ts) | The nightly schedule |
| [src/actions/](src/actions/) | Owner-only server actions: searchTown, refreshNow, confirmSession |
| [src/pages/(app)/home.tsx](<src/pages/(app)/home.tsx>) | Verdict cards and the session card |
| [src/pages/(app)/(protected)/spots.tsx](<src/pages/(app)/(protected)/spots.tsx>) | Spot list and the add-spot form |

## Credits

Swell, sea level and wind data by [Open-Meteo](https://open-meteo.com/).
