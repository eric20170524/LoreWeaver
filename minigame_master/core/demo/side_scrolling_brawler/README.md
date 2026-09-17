# Side Scrolling Brawler core demo

Sixth gameplay-card playtest for `side_scrolling_brawler`.

Controls:
- WASD: move on the belt-scroll lane
- J / Space: light attack
- K: heavy attack
- lower-screen tap: light attack
- DOM controls: pause/resume, retreat, restart

The default authored fixture contains two short locked waves so a real browser run can validate advance → lock → clear → unlock → boss → NodeResult.

Failure fixture: append `?mode=fail` to disable life stock and raise the first enemy's damage. This is used by E2E to verify the real HP-zero settlement path without a forced-state hook.

The hidden `#lw-test-state` element is read-only diagnostic output for Playwright. The page exposes no force-win or HP-edit controls.
