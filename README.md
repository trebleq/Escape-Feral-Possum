# Escape From The Possum Den

A complete, original first-person shooter that runs entirely in the browser — no
backend, no build step, no external accounts. Built with vanilla HTML/CSS/JS and
[Three.js](https://threejs.org/) (loaded from a CDN) for WebGL 3D rendering.

Inspired by the *feel* of fast, old-school corridor shooters — strafing, weapon
switching, aggressive enemies, secrets, keys — but with its own original story,
characters, enemies, weapons and setting. No copyrighted assets, art, sounds, or
text are used anywhere; every texture is generated on a `<canvas>` at runtime and
every sound effect is synthesized with the Web Audio API.

## Story

You wake up trapped in the **Possum Den**, a vast underground complex of caves,
abandoned labs, and strange machinery. Somewhere below, your old friend **Liam**
went missing looking for something in the Den — and something in the Den found
him first. Fight your way through 9 levels, unlock three weapons, uncover what
happened to Liam, and choose how the story ends.

## Play

Just open `index.html` in a modern desktop or mobile browser, or deploy it with
GitHub Pages (below). Click/tap **New Game** to start.

### Controls

**Keyboard + Mouse**
- `WASD` move, mouse look, `Left Click` shoot
- `R` reload, `Space` jump, `Shift` sprint, `Ctrl` crouch
- `1` / `2` / `3` switch weapon, `E` interact, `M` map, `Esc` pause

**Touch (phones/tablets)**
- Left half of screen: virtual joystick to move
- Right half: drag to look
- On-screen buttons: fire, jump, crouch, reload, switch, interact, map, pause

**Gamepad** (Xbox/PlayStation/generic, via the HTML5 Gamepad API)
- Left stick move, right stick look, Right Trigger fire
- Square/X reload, Triangle/Y switch weapon, Circle/B interact
- A/Cross jump, Start pause, Select map

The active control scheme is detected automatically — desktop shows the
mouse-and-keyboard touch layer hidden, touch devices show the on-screen sticks.

## What's in the game

- **9 hand-tuned levels**: The Burrow → The Tunnels → The Forgotten Facility →
  The Nest → The Underground Factory → The Deep Den → The Reactor → The Old
  Burrow → The Heart of the Den, each with its own layout seed, enemy mix,
  lore beats, and difficulty scaling.
- **3 weapons**: Pistol (infinite ammo, always available), Shotgun (unlocked in
  The Forgotten Facility), Ray Gun (unlocked in The Reactor) — each with a
  first-person viewmodel, reload animation, recoil, and distinct sound.
- **6 enemy types** (Grub, Skitterling, Spitter, Brute, Broodcaller, plus
  boss-tier creatures) with different movement, attack, and support behaviors.
- **4 bosses**, including three-phase and four-phase fights, ending in the
  final confrontation with Liam.
- **Two endings** chosen by the player after the final fight, with no ending
  declared canonical.
- Procedural dungeon-style **map** that reveals as you explore, **keys and
  locked doors**, **secrets**, a **shop** for spending scavenged scrap, a
  **save system** (`localStorage`), scripted **cutscenes** with a skip button,
  and settings for sensitivity, FOV, music, SFX, and mute.

## Project structure

```
index.html   - page structure, all UI screens (title, HUD, map, shop, etc.)
style.css    - all visual styling, HUD, and touch-control layout
game.js      - the entire game engine (rendering, input, AI, weapons, save data)
README.md    - this file
```

Three.js is pulled from `https://cdnjs.cloudflare.com` in `index.html` — this is
the one external dependency, included as a plain `<script>` tag so the project
still works as a static site with no build tooling.

## Deploying to GitHub Pages

1. **Create a repository.** On GitHub, click **New repository**, give it a name
   (e.g. `possum-den`), and create it (public, no need to add a README there —
   you already have one).
2. **Upload the files.** On the repo page, click **Add file → Upload files**,
   then drag in `index.html`, `style.css`, `game.js`, and `README.md`. Commit
   the upload directly to the `main` branch.
3. **Enable GitHub Pages.** Go to the repo's **Settings** tab → **Pages** (left
   sidebar). Under "Build and deployment", set **Source** to `Deploy from a
   branch`, then set **Branch** to `main` and folder to `/ (root)`. Click
   **Save**.
4. **Access the game.** GitHub will build the site (usually takes under a
   minute) and show you a URL at the top of the Pages settings, typically:
   `https://<your-username>.github.io/<repo-name>/`
   Open it — the title screen should load.
5. **Updating the game.** To push changes later, edit the files locally and
   use **Add file → Upload files** again (or `git push` if you're using Git
   directly) — GitHub Pages automatically redeploys on every push to `main`.

No further configuration is needed: the game uses only relative paths and runs
entirely client-side.

## Notes

- Save data lives in the browser's `localStorage`, scoped to the page's origin
  — playing via `file://` locally and via GitHub Pages will have separate
  saves, and clearing site data / private browsing will reset progress.
- The 3D geometry, enemies, and pickups per level are generated from a fixed
  seed per level index, so a given level's layout is the same every time you
  play it, while still being procedurally built rather than hand-modeled.
