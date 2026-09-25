# Node 5 ranged actor base image

- Source: built-in ImageGen, text-only prompt. No workspace screenshot or existing character image was supplied.
- Selected file: `shi_mu_bow_base.png`
- SHA-256: `62127728fa1f349a7d3c40b2e42ac09fd8ba5df75d9afdab8426c3cea0c33cf3`
- Status: runtime frames live in the workspace atlas under `player_bow`. The accepted base stayed the identity reference. Cells are `cells/idle_0.png`–`idle_3.png`, `attack_0.png`–`attack_3.png`, `hurt_0.png`, `hurt_1.png`.

## Final prompt

> One original young adult male East Asian fantasy archer with short black hair in a small topknot, dark charcoal travel armor and a restrained deep crimson waist scarf. Show a purple-steel recurved bow across the chest, taut string and violet arrow aimed toward the top of the image. Three-quarter top-down game-sprite view, slightly turned toward screen-right; complete body, hands, bow and feet, detailed crisp pixel art readable at 80 pixels tall, genuine transparent background and ample padding. No sword, spear, shield, silver hair, duplicate figure, scenery, text or watermark.

## Integration

The packed atlas is already 4095×3411, so a ninth character sheet was not added and the eight existing actors were not scaled again. Ten empty 256px cells on `shi_mu` now hold `player_bow`: four idle frames from a locked-camera breathing clip, four attack frames from the unclipped start of the release, and two hurt frames. The release follow-through left the camera, so the attack clip is the draw tightening rather than a full loose; the purple bolt remains the projectile. `ShooterDuelAdapter` resolves `player_bow` before `player`. Node 5 card, 75 seconds, player HP 120, and boss HP 420 are unchanged. The previous candidate zip does not contain these frames.

## Later action replacement

The four attack cells are now superseded by `../bow-action-v3/`: complete upward nock, raise, full draw, and release poses. The idle and hurt cells above remain in use.
