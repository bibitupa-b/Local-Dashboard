---
version: 1
slug: "src-web-app-tsx"
primary_target: "src/web/App.tsx"
related_targets: []
---

# Surface brief — the dashboard

> **Superseded 2026-11-04.** The Aurora Glass direction in `DESIGN.md` replaces this surface brief.
> Kept for history. Do not implement from this file.

**Scope:** the dashboard route only (`/`); Settings keeps its cards and forms.
**Mode:** Operate. The visitor reads a briefing, checks that the machine is in order, and leaves.

## Audience, job, constraints

A technical self-hoster opens this once, in the morning, before anything else. The job is: know
where to start today, then read the briefing. The critique the user answered (2026-11-03) set the
brief: the briefing must own the first page, the activity feed and the attention backlog must leave
the page, and the page is made of a top panel, a sync progress, the briefing, settings and the
connected services. One number says where to start. Motion stays, but it reports state.

## Chosen direction

Structure: **reading column** — full-width masthead and one continuous services line, then a single
reading column with a mono marginal grid. Services drawn as a line of stations; sync is the marker
travelling it. No cards on the dashboard; separation by 1px rules and measure.

Kept from the transit-diagram challenger: the services-as-line topology (state, identity and last
sync readable in one linear sweep, progress as movement).
Kept from the acetate-manual challenger: discrete state changes, no easing on status.
Kept from the ticket-wallet challenger: nothing disappears, a state is stamped.
Kept from the variable-font challenger: hierarchy by scale contrast alone.

## Direction contract

THESIS: The briefing is the page. Refuses the two-column feed-and-backlog dashboard: no activity
list, no queue, no cards on this route — one reading column with a services line above it.
OWN-WORLD: Canon palette on obsidian; porcelain reading text, mist metadata, sand for time and the
reading rule, sage for action and health. Onest 17/1.75 for reading, Unbounded only for the start
figure and its status, Cascadia mono for every label, time and station. Components: the services
line of five stations on a 2px rail with a travelling marker, and a 1px sand margin rule that marks
the line being read.
STORY: The visitor opens it, sees one number and one line, knows the machine is in order, and reads
the briefing to the end without a competing list.
FIRST VIEWPORT: Full-width masthead (mark, name, weekday date, Sync, Settings); below it the start
sentence with its numeral at display scale; below that the services line across the page with five
named stations and their last sync; then the today dateline and the search field; the briefing's
label, timestamp and `Briefing now` sit on a full-width 1px rule at ~420px with its first bullets
already legible.
FORM: reading column, 7 of 7 in my resonance order. seed:ac5b5e87eb1f461e
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

Whether the collapsed earlier briefings should carry their diffs (the evidence affordance the old
feed owned). Left out of this build.
