# Trenchline

A 2v2 tower defense game you can play on one screen or online with friends.

- `game.html` is the whole game.
- `server.js` serves the game and relays messages between players in a room.
- Online, the host's browser runs the game. Everyone else sends their inputs and gets their own team's view back.

## Run it on your computer

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
```

```bash
npm start
```

Open http://localhost:3000. Then click **Play online** → **Host a room**. Open a second browser window, click **Play online**, and join with the 4-letter code.

## Put it online with Render (free)

1. **Make a GitHub repo.** On github.com, click **New repository**, name it `trenchline`, and create it. Then upload these files: `game.html`, `server.js`, `package.json`, `package-lock.json`, `.gitignore`, `README.md`. You can drag them into the **uploading an existing file** link on the empty repo page.
2. **Create a Render account** at https://render.com and sign in with GitHub.
3. **Create the web service.** Click **New** → **Web Service** and pick your `trenchline` repo. Then fill in:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
4. **Deploy.** Click **Create Web Service**. After a minute or two you get a link like `https://trenchline-xxxx.onrender.com`.
5. **Play.** Open the link, click **Play online** → **Host a room**, then **Copy invite link** and send it to your friends. They pick a slot and you press **Start game**.

On the free plan, Render puts the server to sleep after about 15 minutes of no visitors. The first visit after that takes up to a minute to wake it, so open the link a minute before game night.

To update the game later, replace `game.html` in the GitHub repo. Render redeploys automatically.

## Password (optional)

To keep strangers out, add a password in Render: open your service, then **Environment**, then **Add Environment Variable**. Key: `GAME_PASSWORD`, value: your password. Save, and Render restarts the game. Visitors then see a password box first, and are remembered for 30 days. Delete the variable to turn the password off.

## Online controls (same for everyone)

| Action | Keys |
|---|---|
| Move cursor | WASD or arrows (or the mouse) |
| Cycle item / rotate piece | Q (Shift+Q goes back), mouse wheel |
| Use / place / send | E, Space, left click |
| Change Builder mode | Z or Tab |
| Delete a road piece | X or Delete |
| Chat | Enter (or right-click). Enter sends to your team, Shift+Enter to everyone. |
| Ping wheel | Middle mouse button |
| Draw for your team | Hold Alt and move the mouse |

Empty slots are played by the CPU. If someone disconnects mid-game, the CPU takes over their slot.
