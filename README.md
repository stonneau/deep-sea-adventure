# Deep Sea Adventure — web prototype

An unofficial, fan-made digital clone of the board game **Deep Sea Adventure**, designed by Jun Sasaki and Goro Sasaki and published by [Oink Games](https://oinkgames.com/en/games/analog/deep-sea-adventure/). All credit for the game design goes to them — this repo is just a personal web implementation for playing with friends; it doesn't reproduce the rulebook (grab the real game or check Oink Games' page if you want to learn how to play).

Play it live: **https://stonneau.github.io/deep-sea-adventure/**

## Running it locally

It's a static site (plain HTML/CSS/JS, no build step). Any local web server works, e.g.:

```bash
cd deep-sea-adventure
python3 -m http.server 8765
```

Then open `http://localhost:8765/` in a browser.

(Opening `index.html` directly via `file://` also mostly works, except the FR/EN preference won't persist since `localStorage` behaves differently there.)

## How to play

- **Local (same screen):** pick "Play locally", enter how many players and their names, everyone takes turns on the same device.
- **Online with friends:** pick "Play online with friends" → "Host a game" to get a room code, then share it — your friends pick "Join a game" and enter that code plus their name. The host starts the game once everyone's in.
  - This uses peer-to-peer WebRTC (via [PeerJS](https://peerjs.com/)'s free public broker), so there's no server to run or pay for — but the host needs to stay connected for the game to keep going.
  - Each player can switch the UI language (FR/EN) independently, top-right corner — it's a per-browser preference, not shared, so a French host and an English guest can each read the game in their own language.

## Tech

Vanilla JS, no framework, no build step. `game.js` holds the game engine, `net.js` the WebRTC/lobby layer, `i18n.js` the FR/EN strings.
