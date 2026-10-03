// Persistence: SQLite (better-sqlite3) when available, otherwise a small JSON file store with atomic writes.
// Holds accounts (scrypt password hashes), session tokens, characters (save blob + server-authoritative fields)
// and the shared per-zone block edits.
'use strict';
const fs = require('fs');
const path = require('path');

class SqliteStore {
  constructor(file, Database) {
    this.kind = 'sqlite';
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE, pass TEXT NOT NULL,
        admin INTEGER NOT NULL DEFAULT 0, banned INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, last_login INTEGER);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, account_id INTEGER NOT NULL, created INTEGER NOT NULL, last INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS characters (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        race TEXT NOT NULL, cls TEXT NOT NULL, level INTEGER NOT NULL DEFAULT 1, xp INTEGER NOT NULL DEFAULT 0, stats TEXT NOT NULL,
        data TEXT, srv TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS zone_edits (zone TEXT PRIMARY KEY, edits TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS chars_by_account ON characters(account_id);`);
    const p = (s) => this.db.prepare(s);
    this.q = {
      accByName: p('SELECT * FROM accounts WHERE username = ?'), accById: p('SELECT * FROM accounts WHERE id = ?'),
      accInsert: p('INSERT INTO accounts (username, pass, admin, created) VALUES (?, ?, ?, ?)'),
      accSet: p('UPDATE accounts SET admin = ?, banned = ?, pass = ?, last_login = ? WHERE id = ?'),
      accList: p('SELECT id, username, admin, banned, created, last_login FROM accounts ORDER BY id'),
      sesInsert: p('INSERT INTO sessions (token, account_id, created, last) VALUES (?, ?, ?, ?)'),
      sesGet: p('SELECT * FROM sessions WHERE token = ?'), sesTouch: p('UPDATE sessions SET last = ? WHERE token = ?'),
      sesDel: p('DELETE FROM sessions WHERE token = ?'), sesDelAcc: p('DELETE FROM sessions WHERE account_id = ?'),
      sesPrune: p('DELETE FROM sessions WHERE last < ?'),
      chList: p('SELECT * FROM characters WHERE account_id = ? ORDER BY id'), chGet: p('SELECT * FROM characters WHERE id = ?'),
      chByName: p('SELECT * FROM characters WHERE name = ?'),
      chInsert: p('INSERT INTO characters (account_id, name, race, cls, stats, data, srv, created, updated) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)'),
      chSave: p('UPDATE characters SET level = ?, xp = ?, data = ?, srv = ?, updated = ? WHERE id = ?'),
      chDel: p('DELETE FROM characters WHERE id = ?'), chCount: p('SELECT COUNT(*) AS n FROM characters'),
      zeGet: p('SELECT edits FROM zone_edits WHERE zone = ?'), zeSet: p('INSERT INTO zone_edits (zone, edits) VALUES (?, ?) ON CONFLICT(zone) DO UPDATE SET edits = excluded.edits'),
    };
  }
  getAccountByName(n) { return this.q.accByName.get(n) || null; }
  getAccount(id) { return this.q.accById.get(id) || null; }
  createAccount(username, pass, admin) { const r = this.q.accInsert.run(username, pass, admin ? 1 : 0, Date.now()); return this.getAccount(r.lastInsertRowid); }
  updateAccount(a) { this.q.accSet.run(a.admin ? 1 : 0, a.banned ? 1 : 0, a.pass, a.last_login || null, a.id); }
  listAccounts() { return this.q.accList.all(); }
  createSession(token, accountId) { const t = Date.now(); this.q.sesInsert.run(token, accountId, t, t); }
  getSession(token) { return this.q.sesGet.get(token) || null; }
  touchSession(token) { this.q.sesTouch.run(Date.now(), token); }
  deleteSession(token) { this.q.sesDel.run(token); }
  deleteSessionsFor(accountId) { this.q.sesDelAcc.run(accountId); }
  pruneSessions(maxAgeMs) { this.q.sesPrune.run(Date.now() - maxAgeMs); }
  listCharacters(accountId) { return this.q.chList.all(accountId).map(rowChar); }
  getCharacter(id) { return rowChar(this.q.chGet.get(id)); }
  getCharacterByName(n) { return rowChar(this.q.chByName.get(n)); }
  createCharacter(accountId, c) { const t = Date.now(); const r = this.q.chInsert.run(accountId, c.name, c.race, c.cls, JSON.stringify(c.stats), JSON.stringify(c.srv || {}), t, t); return this.getCharacter(r.lastInsertRowid); }
  saveCharacter(c) { this.q.chSave.run(c.level, c.xp, c.data ? JSON.stringify(c.data) : null, JSON.stringify(c.srv || {}), Date.now(), c.id); }
  deleteCharacter(id) { this.q.chDel.run(id); }
  countCharacters() { return this.q.chCount.get().n; }
  getZoneEdits(zone) { const r = this.q.zeGet.get(zone); return r ? JSON.parse(r.edits) : {}; }
  setZoneEdits(zone, edits) { this.q.zeSet.run(zone, JSON.stringify(edits)); }
  close() { try { this.db.close(); } catch (e) { /* ignore */ } }
}
function rowChar(r) {
  if (!r) return null;
  return { id: r.id, account_id: r.account_id, name: r.name, race: r.race, cls: r.cls, level: r.level, xp: r.xp, stats: JSON.parse(r.stats),
    data: r.data ? JSON.parse(r.data) : null, srv: r.srv ? JSON.parse(r.srv) : {}, created: r.created, updated: r.updated };
}

// Fallback: everything in one JSON file, rewritten atomically (debounced). Fine for small servers.
class JsonStore {
  constructor(file) {
    this.kind = 'json';
    this.file = file;
    this.d = { nextAcc: 1, nextChar: 1, accounts: [], sessions: {}, characters: [], zoneEdits: {} };
    if (fs.existsSync(file)) this.d = Object.assign(this.d, JSON.parse(fs.readFileSync(file, 'utf8')));
    this.t = null;
  }
  dirty() { if (!this.t) this.t = setTimeout(() => this.flush(), 1000); }
  flush() { clearTimeout(this.t); this.t = null; const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.d)); fs.renameSync(tmp, this.file); }
  getAccountByName(n) { n = String(n).toLowerCase(); return this.d.accounts.find((a) => a.username.toLowerCase() === n) || null; }
  getAccount(id) { return this.d.accounts.find((a) => a.id === id) || null; }
  createAccount(username, pass, admin) { const a = { id: this.d.nextAcc++, username, pass, admin: admin ? 1 : 0, banned: 0, created: Date.now(), last_login: null }; this.d.accounts.push(a); this.dirty(); return a; }
  updateAccount(a) { const x = this.getAccount(a.id); if (x) Object.assign(x, a); this.dirty(); }
  listAccounts() { return this.d.accounts.map(({ pass, ...a }) => a); }
  createSession(token, accountId) { const t = Date.now(); this.d.sessions[token] = { token, account_id: accountId, created: t, last: t }; this.dirty(); }
  getSession(token) { return this.d.sessions[token] || null; }
  touchSession(token) { const s = this.d.sessions[token]; if (s) { s.last = Date.now(); this.dirty(); } }
  deleteSession(token) { delete this.d.sessions[token]; this.dirty(); }
  deleteSessionsFor(id) { for (const k in this.d.sessions) if (this.d.sessions[k].account_id === id) delete this.d.sessions[k]; this.dirty(); }
  pruneSessions(maxAgeMs) { const lim = Date.now() - maxAgeMs; for (const k in this.d.sessions) if (this.d.sessions[k].last < lim) delete this.d.sessions[k]; this.dirty(); }
  listCharacters(accountId) { return this.d.characters.filter((c) => c.account_id === accountId).map((c) => JSON.parse(JSON.stringify(c))); }
  getCharacter(id) { const c = this.d.characters.find((x) => x.id === id); return c ? JSON.parse(JSON.stringify(c)) : null; }
  getCharacterByName(n) { n = String(n).toLowerCase(); const c = this.d.characters.find((x) => x.name.toLowerCase() === n); return c ? JSON.parse(JSON.stringify(c)) : null; }
  createCharacter(accountId, c) { const t = Date.now(); const r = { id: this.d.nextChar++, account_id: accountId, name: c.name, race: c.race, cls: c.cls, level: 1, xp: 0, stats: c.stats, data: null, srv: c.srv || {}, created: t, updated: t }; this.d.characters.push(r); this.dirty(); return this.getCharacter(r.id); }
  saveCharacter(c) { const x = this.d.characters.find((y) => y.id === c.id); if (!x) return; Object.assign(x, { level: c.level, xp: c.xp, data: c.data, srv: c.srv, updated: Date.now() }); this.dirty(); }
  deleteCharacter(id) { this.d.characters = this.d.characters.filter((c) => c.id !== id); this.dirty(); }
  countCharacters() { return this.d.characters.length; }
  getZoneEdits(zone) { return Object.assign({}, this.d.zoneEdits[zone] || {}); }
  setZoneEdits(zone, edits) { this.d.zoneEdits[zone] = edits; this.dirty(); }
  close() { if (this.t) this.flush(); }
}

function openStore(dataDir, prefer) {
  fs.mkdirSync(dataDir, { recursive: true });
  if (prefer !== 'json') {
    try { const Database = require('better-sqlite3'); return new SqliteStore(path.join(dataDir, 'everblock.db'), Database); }
    catch (e) { if (prefer === 'sqlite') throw e; console.warn('[store] better-sqlite3 unavailable (' + e.message.split('\n')[0] + '), using the JSON store'); }
  }
  return new JsonStore(path.join(dataDir, 'everblock.json'));
}
module.exports = { openStore };
