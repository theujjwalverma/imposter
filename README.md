# Imposter Game

Realtime multiplayer imposter game built with Node.js + Socket.io.

## Game Rules

### Objective
- Most players receive the same secret word.
- A few players are imposters and do not see the word.
- Players discuss and vote to find an imposter.

### Roles
- `Normal Player`: sees the common word.
- `Imposter`: sees `IMPOSTER` instead of the word.

### Room Rules
- Up to `100` players can join a room.
- Minimum `3` players needed to start.
- Host can choose imposter count from `1` to `6` (limited by players).

### Round Flow
1. Host creates room (`/host/<ROOM_ID>`).
2. Host shares player link (`/room/<ROOM_ID>`).
3. Players join with only name.
4. Host sets imposter count (optional) and starts game.
5. Server picks one common word and random imposters.
6. Discussion happens.
7. Host opens voting.
8. Every player votes once.
9. Host reveals result.

### Win Condition
- If the voted player is **any one** of the imposters: `Players Win`.
- Otherwise: `Imposters Win`.
- Reveal screen shows all imposters.

## Links
- Host link: `/host/<ROOM_ID>`
- Player link: `/room/<ROOM_ID>`

Example:
- Host: `https://your-domain.com/host/9S2ZT6`
- Player: `https://your-domain.com/room/9S2ZT6`

## Word List
Current default words are in `server.js`:
- Pizza
- Tiger
- Mango
- Airport
- Doctor
- Netflix
- Elephant

## Tech Stack
- Frontend: HTML/CSS/Vanilla JS + Socket.io client
- Backend: Node.js + Express + Socket.io
- Storage: In-memory (no database)

## Local Run
```bash
npm install
npm start
```

Default URL:
- `http://localhost:3000`

If port busy:
```bash
PORT=4010 npm start
```

## Deploy Notes
- This app needs a persistent Node server (Socket.io + in-memory state).
- Recommended: Render/Railway/Fly with a long-running web service.
- Not suitable for Vercel serverless-only Socket.io architecture without redesign.

## Current Limitations
- No database: room/game state resets on server restart.
- No auth: host reclaim relies on local host key in browser session storage.
