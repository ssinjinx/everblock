# Running an Everblock server (v6 multiplayer)

Everblock v6 adds a small Node.js server. It runs **one shared, persistent world**: it owns the monsters, their AI, loot, respawns, corpses, block edits and saved characters, and every player connects to it from the normal game page. Solo play is unchanged. The GitHub Pages build and `file://` still work offline without any server.

This guide sets up a server on a Linux VPS (Ubuntu or Debian) with Docker. The whole thing takes about 10 minutes.

- [What you need](#what-you-need)
- [Quick start](#quick-start-ubuntu--debian)
- [HTTPS: domain, sslip.io or plain IP](#https-domain-sslipio-or-plain-ip)
- [Settings (.env)](#settings-env)
- [Admins and in-game admin commands](#admins)
- [Backups](#backups) · [Updating](#updating) · [Logs and troubleshooting](#logs-and-troubleshooting)
- [Running without Docker](#running-without-docker-npm--systemd)
- [How it works, and its limits](#how-it-works-and-its-limits)

## What you need

| | |
|---|---|
| **Minimum** | 1 vCPU, 1 GB RAM, 5 GB disk. Fine for a handful of friends. |
| **Comfortable** | 2 vCPU, 2 GB RAM. Plenty for a few dozen players. |
| **OS** | Any 64-bit Linux that runs Docker. These steps use Ubuntu 22.04/24.04 or Debian 12. |
| **Network** | Ports 80 and 443 open. A domain name is optional (see [HTTPS](#https-domain-sslipio-or-plain-ip)). |

The server is one Node.js process. Zones are generated the first time someone enters them, which takes about 0.2 s, and they idle when empty. **Measured** with `server/test/load.js`: 100 simulated players in two zones, all walking and fighting at the same time, used about **half of one CPU core and ~280 MB RAM**, with about 30 KB/s of downstream traffic per player.

> **Your VPS (12 vCore, 24 GB RAM, 720 GB NVMe, IPv4 only)** is far more than Everblock needs. It can comfortably host **many** players: the load test above (100 players) used less than one of your 12 cores and about 1% of your RAM. Because the world runs in a single process, extra cores mostly leave headroom for the OS, Caddy and backups. The game itself stays at its light defaults (`MAX_PLAYERS=200`, 8 connections per IP). You only need to raise `MAX_PLAYERS` if you ever get close to that. Disk is a non-issue: a save is a few KB per character.
> **IPv4 only is fine.** You do **not** need IPv6 or an AAAA record. Create only the **A** record. (If your DNS provider has an AAAA record for the name, delete it. Otherwise Let's Encrypt may try IPv6 and fail.)

## Quick start (Ubuntu / Debian)

Log in to your VPS over SSH as root (or a user with sudo), then:

```bash
# 1. Docker (official convenience script; installs docker + the compose plugin)
curl -fsSL https://get.docker.com | sh

# 2. Firewall: SSH, HTTP, HTTPS (skip if your provider uses a cloud firewall; then open 22, 80, 443 there)
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# 3. Get Everblock and configure it
git clone https://github.com/ssinjinx/everblock.git
cd everblock
cp .env.example .env
nano .env          # set DOMAIN (or leave empty for http://<ip>), SERVER_NAME, ADMINS ...

# 4. Start it (builds the image the first time, ~1 minute)
docker compose up -d
docker compose logs -f everblock     # Ctrl+C to stop following the log
```

Then open `https://<your DOMAIN>/` (or `http://<server-ip>/` without a domain), click **🌐 Play Online**, register and create a character. **Register your own account first**: unless `ADMINS` is set, the first account created on a new server becomes the admin. Give your friends the same address.

Players can also connect from the GitHub Pages copy or a saved/installed copy of the game. They click **Play Online** and type your server address (`play.example.com`). That only works if your server uses **https**, because browsers block insecure `ws://` connections from an https page. The easiest option is to just share your server's own address.

## HTTPS: domain, sslip.io or plain IP

The bundled **Caddy** container handles HTTPS automatically (Let's Encrypt certificates, renewals, WebSockets). Choose one:

1. **Your own domain (recommended).** Create a DNS **A record**, e.g. `play.example.com → <server IPv4>`. No AAAA record is needed (see above). Put `DOMAIN=play.example.com` in `.env` and run `docker compose up -d`. Caddy gets the certificate on its first start. Ports 80 and 443 must be reachable from the internet. Check with `docker compose logs caddy` if it doesn't come up.
2. **No domain, but still HTTPS: sslip.io.** `DOMAIN=203-0-113-7.sslip.io` (your IP with dashes). Every `<ip>.sslip.io` name resolves to that IP, so Let's Encrypt works without buying a domain.
3. **Plain http.** Leave `DOMAIN=` empty. Caddy serves `http://<server-ip>/` on port 80. This works fine for playing on that page (and Phone Mode works over http too). However, the app can't be installed as a PWA and other https pages can't connect to it.

Already running nginx or another proxy? Remove the `caddy` service, set `BIND_ADDR=127.0.0.1` and `TRUST_PROXY=1`, and proxy your site to `http://127.0.0.1:8080`. The proxy must pass the WebSocket upgrade on `/ws`.

## Settings (.env)

All settings are in `.env` (copied from [.env.example](.env.example)). Run `docker compose up -d` after changing it.

| Variable | Default | Meaning |
|---|---|---|
| `DOMAIN` | *(empty)* | Domain for automatic HTTPS. Empty = plain http on port 80. |
| `SERVER_NAME` | `Everblock` | Shown on the start screen and in `/who`. |
| `MOTD` | | Message of the day, shown on login (`/setmotd` changes it until restart). |
| `ADMINS` | *(empty)* | Comma-separated account names with admin powers. |
| `ALLOW_REGISTER` | `1` | `0` closes sign-ups (create accounts with `admin.js create`). |
| `ALLOW_BUILD` | `1` | `0` disables placing/breaking blocks online. |
| `MAX_PLAYERS` | `200` | Maximum simultaneous connections. |
| `MAX_CONN_PER_IP` | `8` | Connections per IP (a household can share one IP). |
| `WORLD_SEED` | `1999` | Terrain seed for the shared world (number or text). |
| `PORT` | `8080` | Port the game server listens on. |
| `BIND_ADDR` | `127.0.0.1` | Docker only: `0.0.0.0` also exposes the game port directly, e.g. for running without Caddy. |
| `TRUST_PROXY` | `0` (`1` in compose) | Read client IPs from `X-Forwarded-For`. Only enable it behind a proxy. |
| `DATA_DIR` | `server/data` (`/data` in Docker) | Where the database lives. |
| `STORE` | `sqlite` | `json` forces the simple JSON file store (used automatically if SQLite isn't available). |

## Admins

- **Who is an admin:** accounts listed in `ADMINS`, plus the first account ever registered (only when `ADMINS` is empty). You can also promote accounts from the command line:
  ```bash
  docker compose exec everblock node admin.js list
  docker compose exec everblock node admin.js promote alice
  docker compose exec everblock node admin.js create bob s3cretpass     # e.g. with ALLOW_REGISTER=0
  docker compose exec everblock node admin.js password bob newpass123
  docker compose exec everblock node admin.js ban troll                 # also: unban, demote, chars <user>
  ```
- **In game** (type in chat; `/gm` lists them):
  `/announce <text>` (server-wide message) · `/kick <name>` · `/ban <name>` / `/unban <name>` · `/setmotd <text>` · `/tp <x> <z>` · `/goto <name>` · `/summon <name>`
- **Everyone:** `/say` (or just type) · `/shout` (zone) · `/ooc` (server-wide) · `/tell <name> <msg>` and `/r` · `/who` · `/invite [name]` (or target a player) · `/join` · `/decline` · `/disband` · `/g <msg>` (group) · `/motd` · `/camp` or `/logout`

## Backups

Everything (accounts, characters, world edits) is one SQLite file, `everblock.db`, in the `everblock-data` Docker volume. To take a consistent copy while the server runs:

```bash
mkdir -p ~/everblock-backups
docker compose exec everblock node -e "require('better-sqlite3')('/data/everblock.db').backup('/data/backup.db').then(()=>console.log('ok'))"
docker compose cp everblock:/data/backup.db ~/everblock-backups/everblock-$(date +%F).db
```

Nightly cron example (`crontab -e`). Run it from the `everblock` folder and keep 14 days:
```
30 4 * * * cd ~/everblock && docker compose exec -T everblock node -e "require('better-sqlite3')('/data/everblock.db').backup('/data/backup.db')" && docker compose cp everblock:/data/backup.db ~/everblock-backups/everblock-$(date +\%F).db && find ~/everblock-backups -name '*.db' -mtime +14 -delete
```

**Restore:** `docker compose stop everblock`, then `docker compose cp ~/everblock-backups/everblock-2026-10-03.db everblock:/data/everblock.db`, then `docker compose start everblock`.
(With the JSON store, the file is `/data/everblock.json` instead. Copy it the same way.)

## Updating

```bash
cd ~/everblock
git pull
docker compose up -d --build
```
Players get the new game page the next time they load it (the service worker picks up new versions automatically). Characters and the world are kept in the volume. On shutdown, the server saves everyone before it stops (`docker compose stop` gives it time to do that).

## Logs and troubleshooting

- `docker compose ps` shows status and health. `docker compose logs -f everblock` shows logins, zones and admin actions. `docker compose logs caddy` shows certificates.
- `curl http://127.0.0.1:8080/api/info` on the server should print the server name and player count.
- **Certificate not issued:** the A record must point to this server, ports 80 and 443 must be open (`ufw status`, plus your provider's firewall), and there must be no stale AAAA record.
- **"Could not reach the server" in the game:** check the address. If the page is https, the server must be https too.
- **Restart:** `docker compose restart everblock`. **Stop:** `docker compose down` (keeps the data volume; `down -v` would delete it).

## Running without Docker (npm / systemd)

Needs Node.js 18 or newer (`node -v`).

```bash
git clone https://github.com/ssinjinx/everblock.git && cd everblock
cp .env.example .env
cd server && npm ci --omit=dev
npm start                 # serves http://<host>:8080/ (PORT in .env)
```
`npm test` runs the protocol test with bot clients. For a permanent install, use the example unit [server/everblock.service](server/everblock.service) (instructions inside) and put Caddy or nginx in front for HTTPS (`TRUST_PROXY=1`). Data goes to `server/data/` unless `DATA_DIR` is set.

## How it works, and its limits

- **Authoritative server.** The server generates the zones from `WORLD_SEED` with the same code as the browser game (`source/src` is shared). It runs monster AI, aggro, pathing, respawns, loot tables and kill credit at 20 Hz. It sends delta snapshots to each player about 10 times a second, and clients interpolate between them.
- **Clients send intentions** (move, attack damage, taunts, crowd control, loot, block edits, chat). The server checks them: movement speed and position, damage caps, attack range and rate, loot rights, build permission and chat rate limits. Bad input is ignored or corrected, and repeated abuse disconnects the player. Passwords are hashed with scrypt, and logins use random session tokens.
- **Shared:** monsters, kills, XP (with EQ-style group split), loot, corpses, block edits, chat and groups. Heals and buffs can be cast on group members. Each player's mercenaries and pets fight alongside them and are visible to others.
- **Limits (it's a hobby server, not a hardened MMO):** combat math still runs in the player's browser and is capped and sanity-checked rather than fully simulated server-side. Quests, merchants and inventory are kept per character with validation, but they aren't fully server-simulated. There is no trading between players. Each zone runs on one Node process (one server = one world). Clocks and positions are smoothed, so very high latency (>400 ms) looks jumpy.
