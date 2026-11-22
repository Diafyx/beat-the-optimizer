# 5. A guided game screen, built for phones

- Status: accepted
- Date: 2026-11-22

## Context

The first public build showed the whole level on one long page: the story,
the query, the table details, then a form of radio buttons. It worked and
passed every gate, but players could not tell what the game was or what to do
first. Most players arrive on phones, and the form began two screens down.

The idea of the game also needs saying: a database picks a plan from guesses
about row counts, and the player tries to pick a better one.

## Decision

The game screen becomes a guided flow, built in four steps (the UI track of
v0.1.0):

1. **A visual base, "Race Night"**: the game is a race against the
   Optimizer, drawn like the timing graphics of a night race. Dark asphalt,
   condensed italic type for headings and numbers (Barlow Condensed), Barlow
   for text, and tiles with two cut corners. Orange is the player, blue is
   the Optimizer (PostgreSQL's planner), yellow is a flag on a wrong
   estimate, and purple is the perfect plan, everywhere. Phones get a single
   column with the main action in a bar fixed to the bottom; computers get a
   wider stage with cards side by side.
2. **An explainer** on the first visit: what a plan is, that PostgreSQL
   guesses, and how a plan is scored.
3. **A plan builder with one question per screen**: each answer is in plain
   words, with the database term underneath. PostgreSQL's row estimate is shown
   next to each table.
4. **The run as a race** between the two plans, then a line that shows where
   PostgreSQL's estimate was wrong, then the result.

The engine, the levels, scoring and the share card do not change.

The look is dark only. A race at night is the idea, the four colours are
chosen to stand out on dark asphalt, and a light version would be a second
design to keep passing contrast checks. The page says `color-scheme: dark`,
so the browser's own controls match it.

The game is also planned as a Play Store app, so the shell works full screen:
it keeps clear of the phone's safe areas and needs no browser controls.

## Alternatives

- **Restyle the long page only**: cheaper, but it keeps the order that lost
  players.
- **A terminal look, like `psql`**: suits people who write SQL, but it is hard
  to read on a phone and does not explain the game.
- **A drag-and-drop plan tree with animated row flows**: tried as a
  prototype; it was too much to take in at once.
- **A calm light and dark theme**: built first. It read well but looked like
  any form, and gave players no sense of a race.

## Consequences

- The fonts are served with the site, so the Content-Security-Policy allows
  `font-src 'self'` and nothing more. Four Latin subsets add about 91 kB,
  inside the Lighthouse page budget; each page preloads two of them.
- Players who set their system to a light theme still get the dark page.
- Every UI step keeps the existing gates: axe, Lighthouse, the JavaScript
  budget, and e2e tests on four browsers.
