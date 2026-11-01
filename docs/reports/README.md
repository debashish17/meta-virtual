# Work package reports

One file per work package, named by its ID (`P2-A.md`, `P3-B.md`, ...), written by the agent that
built it when the package is done, in the format of `AGENTS.md` section 8. The lead reads the report
before merging; the reviewer reads them all at the end (`docs/HANDOFF.md` section 8).

A report records what was done and how to verify it, every file changed outside the package's
"Owns" list, and every request to the lead (contract changes, dependencies, files owned by others).
It never contains secrets, keys or tokens.
