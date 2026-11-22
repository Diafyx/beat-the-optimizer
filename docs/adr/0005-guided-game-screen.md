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

1. **A visual base**: self-hosted fonts, light and dark colours, a single
   column up to 520 px, and the main action in a bar fixed to the bottom.
   Orange is the player and blue is PostgreSQL, everywhere.
2. **An explainer** on the first visit: what a plan is, that PostgreSQL
   guesses, and how a plan is scored.
3. **A plan builder with one question per screen**: each answer is in plain
   words, with the database term underneath. PostgreSQL's row estimate is shown
   next to each table.
4. **The run as a race** between the two plans, then a line that shows where
   PostgreSQL's estimate was wrong, then the result.

The engine, the levels, scoring and the share card do not change.

## Alternatives

- **Restyle the long page only**: cheaper, but it keeps the order that lost
  players.
- **A terminal look, like `psql`**: suits people who write SQL, but it is hard
  to read on a phone and does not explain the game.
- **A drag-and-drop plan tree with animated row flows**: tried as a
  prototype; it was too much to take in at once.

## Consequences

- The fonts are served with the site, so the Content-Security-Policy allows
  `font-src 'self'` and nothing more. They add about 82 kB, inside the
  Lighthouse page budget.
- Every UI step keeps the existing gates: axe, Lighthouse, the JavaScript
  budget, and e2e tests on four browsers.
