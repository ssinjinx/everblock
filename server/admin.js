#!/usr/bin/env node
// Everblock server admin CLI (run on the server; stop the server first when using the JSON store).
//   node admin.js list                      accounts
//   node admin.js create <user> <pass>      new account (e.g. with ALLOW_REGISTER=0)
//   node admin.js promote <user>            make an admin (can /kick, /announce, /ban in game)
//   node admin.js demote <user>
//   node admin.js ban <user> | unban <user>
//   node admin.js password <user> <newpass>
//   node admin.js chars <user>              characters on an account
// With Docker: docker compose exec everblock node admin.js list
'use strict';
const path = require('path');
const fs = require('fs');
for (const f of [path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')]) if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]; }
const { openStore } = require('./lib/store');
const { hashPass } = require('./lib/server');
const store = openStore(path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data')), process.env.STORE);
const [cmd, user, arg] = process.argv.slice(2);
(async () => {
  const acc = user ? store.getAccountByName(user) : null;
  const need = () => { if (!acc) { console.error(`No account named ${user}`); process.exit(1); } };
  switch (cmd) {
    case 'list': for (const a of store.listAccounts()) console.log(`${a.id}\t${a.username}${a.admin ? '\t[admin]' : ''}${a.banned ? '\t[banned]' : ''}`); break;
    case 'create': if (!user || !/^[A-Za-z0-9_]{3,16}$/.test(user) || !arg || arg.length < 6) { console.error('Usage: create <user (3-16 letters/numbers/_)> <password (6+ chars)>'); process.exit(1); } if (acc) { console.error(`${user} already exists`); process.exit(1); } store.createAccount(user, await hashPass(arg), false); console.log(`Created account ${user}`); break;
    case 'promote': case 'demote': need(); acc.admin = cmd === 'promote' ? 1 : 0; store.updateAccount(acc); console.log(`${acc.username} is ${acc.admin ? 'now' : 'no longer'} an admin`); break;
    case 'ban': case 'unban': need(); acc.banned = cmd === 'ban' ? 1 : 0; store.updateAccount(acc); if (acc.banned) store.deleteSessionsFor(acc.id); console.log(`${acc.username} ${cmd}ned`); break;
    case 'password': need(); if (!arg || arg.length < 6) { console.error('Password must be at least 6 characters'); process.exit(1); } acc.pass = await hashPass(arg); store.updateAccount(acc); store.deleteSessionsFor(acc.id); console.log(`Password changed for ${acc.username}`); break;
    case 'chars': need(); for (const c of store.listCharacters(acc.id)) console.log(`${c.id}\t${c.name}\tlevel ${c.level} ${c.race} ${c.cls}`); break;
    default: console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 10).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  }
  store.close();
})();
