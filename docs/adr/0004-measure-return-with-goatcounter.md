# 4. Measure next-day return with GoatCounter events

- Status: accepted
- Date: 2026-11-22

## Context

The first release is a test of demand. Its main number is how many players
come back the day after they first finish a puzzle. The game has no accounts
and no backend, and it should not use cookies or identifiers.

Page analytics cannot answer the question on its own: a cookieless tool cannot
tell that today's visitor also came yesterday, by design. The browser can: the
game already keeps the player's progress in local storage.

## Decision

- The game works out a return itself. Progress keeps the local date of the
  first finished daily puzzle and the events already sent. The game sends:
  - `first_finish`, once, when the player finishes their first daily puzzle;
  - `return_d1`, once, on opening the site the next calendar day;
  - `return_d2_7`, once, on opening it on a later day of that first week.
- An event is only its name: no identifier, date, level or score. The rate is
  `return_d1 / first_finish`, read from the dashboard.
- Events and visits go to **GoatCounter**, by a plain request to its count
  endpoint, without loading its script. A visit sends the page's path and the
  origin of the referring site.
- **Cloudflare Web Analytics** counts visits too, as a cross-check. It cannot
  count events.
- With **Global Privacy Control** on, nothing is sent to either, and the date
  and events are not stored.
- The build turns each service on with `GOATCOUNTER_CODE` and
  `CF_BEACON_TOKEN`. The same settings write the Content-Security-Policy in
  `_headers`, which allows only the hosts in use.
- The `/privacy` page says exactly what is stored and what is sent.

## Alternatives

- **Plausible**: polished and cookieless, with goals for events, but a monthly
  fee for a test that may stop after a few weeks.
- **Cloudflare Web Analytics alone**: free, and the site is on Cloudflare
  anyway, but it has no custom events, so it cannot measure a return.
- **A Worker of our own with Workers Analytics Engine**: no third party, and
  harder to block, but it adds a backend endpoint and its queries, which the
  first release avoids.
- **No measurement**: the test could not be judged.

## Consequences

- No cookies, no identifiers and no consent banner. The storage is the
  game's own progress.
- GoatCounter's hosted service is free for non-commercial use. If the game
  becomes commercial, move to a paid plan or host GoatCounter ourselves.
- Every known bias lowers the measured rate: private windows, cleared storage,
  a second device, ad blockers and Global Privacy Control. A low number is the
  conservative result for a go or no-go decision.
- Practice levels (`?level=`) do not count as a finish; only the daily puzzle
  does.
