// Everblock - group members: hireable mercenaries (Cleric healer / Warrior tank) and necromancer pets
(function () {
  const EB = window.EB;
  const U = EB.util;
  const { MERCS, PETS, SPELLS, ITEMS } = EB.data;
  const { buildModel, animateModel, makeNameplate, physicsMove, Entity } = EB.ent;
  const Nav = EB.path.Nav;
  const STANCES = ['passive', 'balanced', 'aggressive'];

  class Merc extends Entity {
    constructor(role, game, saved) {
      const isPet = role === 'pet';
      const petLvl = isPet ? (saved && saved.petLvl) || 3 : 0;
      const M = isPet ? Object.assign({ cls: 'warrior' }, PETS[petLvl] || PETS[3]) : MERCS[role];
      super('merc', M.name);
      this.role = role; this.cls = M.cls; this.isPet = isPet; this.petLvl = petLvl;
      this.level = isPet ? petLvl : game.player.level;
      const tank = role === 'tank';
      if (isPet) this.model = buildModel({ model: 'biped', color: M.color, skin: M.color, hair: null, thin: petLvl < 13, weapon: petLvl >= 8, scale: petLvl >= 13 ? 1.1 : 0.95, legColor: M.color, glow: petLvl >= 13 ? 0x8040ff : undefined });
      else this.model = buildModel({ model: 'biped', color: M.color, skin: M.skin, hair: tank ? null : M.hair, scale: M.scale || 1, weapon: true,
        shield: tank ? 0x7a5a3a : undefined, helm: tank ? 0x9a9aa8 : undefined, legColor: tank ? 0x5a5a6a : 0xd0d0e8 });
      this.hw = 0.3; this.h = Math.max(1.4, this.model.height * 0.95);
      const owner = game.player.name;
      this.plate = makeNameplate(M.name, '#70ff70', isPet ? `<${owner}'s pet>` : tank ? '<Warrior Mercenary>' : '<Cleric Mercenary>');
      this.buffs = (saved && saved.buffs) || []; this.nav = new Nav(); this.swing = 1; this.casting = null; this.tauntT = 0; this.healT = 0;
      this.stance = (saved && STANCES.includes(saved.stance)) ? saved.stance : 'balanced';
      this.healAt = saved && saved.healAt ? U.clamp(saved.healAt, 0.2, 0.95) : 0.62;
      this.equip = (saved && saved.equip) || {};
      this.dead = !!(saved && saved.dead);
      this.hp = saved && saved.hp > 0 ? Math.min(saved.hp, this.maxHp) : this.maxHp;
      this.mana = saved && saved.mana != null ? saved.mana : this.maxMana;
      this.eyeH = this.h * 0.9;
    }
    get alive() { return !this.dead; }
    buffSum(f) { let t = 0; for (const b of this.buffs) if (b.buff[f]) t += b.buff[f]; return t; }
    itemSum(f) { let t = 0; for (const sl in this.equip) { const it = ITEMS[this.equip[sl].id]; if (it && it[f]) t += it[f]; } return t; }
    statSum(n) { let t = 0; for (const sl in this.equip) { const it = ITEMS[this.equip[sl].id]; if (it && it.stats && it.stats[n]) t += it.stats[n]; } return t; }
    get maxHp() {
      if (this.isPet) return Math.floor(EB.calc.maxHp('warrior', this.level, 80) * 0.85);
      const base = Math.floor(EB.calc.maxHp(this.cls, this.level, this.role === 'tank' ? 100 : 85) * (this.role === 'tank' ? 1.3 : 1));
      return base + this.buffSum('hp') + this.itemSum('hp') + Math.floor(this.statSum('STA') * this.level / 6);
    }
    get maxMana() { return this.role === 'healer' ? EB.calc.maxMana('cleric', this.level, [0, 0, 0, 0, 110 + this.statSum('WIS'), 0, 0]) + this.itemSum('mana') : 0; }
    get ac() { if (this.isPet) return 10 + this.level * 3; return (this.role === 'tank' ? 20 + this.level * 4 : 8 + this.level * 2) + this.buffSum('ac') + this.itemSum('ac') + Math.floor(this.statSum('AGI') / 4); }
    healSpell() { const L = this.level; return L >= 9 ? 'healing' : L >= 4 ? 'light_healing' : 'minor_healing'; }
    toSave() { return { role: this.role, hp: this.hp, mana: this.mana, buffs: this.buffs, stance: this.stance, healAt: this.healAt, equip: this.equip, dead: this.dead, petLvl: this.petLvl || undefined }; }
    startCast(id, target, game) {
      const sp = SPELLS[id];
      this.casting = { id, sp, target, t: sp.cast };
      this.mana -= sp.mana;
      if (game.player.pos.distanceTo(this.pos) < 50) game.log(`${this.name} begins to cast a spell. <${sp.name}>`, 'spell');
    }
    finishCast(game) {
      const c = this.casting; this.casting = null;
      const t = c.target, sp = c.sp;
      if (!t || !t.alive) return;
      if (sp.kind === 'heal') {
        const amt = U.randInt(sp.amt[0], sp.amt[1]) + Math.floor((sp.perLvl || 0) * (this.level - 1));
        const before = t.hp; t.hp = Math.min(t.maxHp, t.hp + amt);
        const got = Math.round(t.hp - before);
        if (t === game.player) game.log(`You feel much better. (${this.name}'s ${sp.name}: +${got} HP)`, 'spell');
        else game.log(`${t.name === this.name ? this.name : t.name} feels much better. (+${got} HP)`, 'spell');
        game.healAggro(this, got);
        EB.audio.heal();
      } else if (sp.kind === 'buff') {
        t.buffs = t.buffs.filter((b) => b.id !== c.id);
        t.buffs.push({ id: c.id, name: sp.name, left: sp.dur, buff: sp.buff });
        if (t === game.player) game.log(`You feel brave. (${this.name} casts ${sp.name} on you)`, 'spell');
      }
    }
    update(dt, game) {
      if (this.dead) return;
      const pl = game.player;
      let dir = null, speed = 5.9;
      if (!this.isPet && this.level !== pl.level) { const pct = this.hp / this.maxHp; this.level = pl.level; this.hp = Math.ceil(this.maxHp * pct); }
      if (!pl.alive) { this.vel.set(0, this.vel.y, 0); physicsMove(game.world, this, dt, true); this.syncModel(); return; }
      if (this.pos.distanceTo(pl.pos) > 60) { this.pos.set(pl.pos.x + 1.5, pl.pos.y + 0.2, pl.pos.z + 1.5); this.nav.reset(); }
      const foe = game.mercFoe(this);
      const distPl = this.pos.distanceTo(pl.pos);
      if (this.casting) {
        this.casting.t -= dt;
        if (this.casting.target && this.casting.target !== this) this.faceTo(this.casting.target.pos.x, this.casting.target.pos.z);
        if (this.casting.t <= 0) this.finishCast(game);
      } else if (this.role === 'healer') {
        this.healT -= dt;
        const members = game.groupMembers().filter((m) => m.alive && m.pos.distanceTo(this.pos) < 30).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
        const low = members[0], hs = SPELLS[this.healSpell()];
        if (low && low.hp / low.maxHp < this.healAt && this.mana >= hs.mana && this.healT <= 0) { this.startCast(this.healSpell(), low, game); this.healT = 1; }
        else if (!foe && !game.groupInCombat() && this.mana > this.maxMana * 0.5) {
          const need = members.find((m) => !m.buffs.some((b) => b.id === 'courage'));
          if (need && this.mana >= SPELLS.courage.mana) this.startCast('courage', need, game);
        }
        if (!this.casting) {
          if (foe && foe.alive && this.dist(foe) < 2.8 && this.mana > this.maxMana * 0.3) this.melee(foe, game, dt);
          else if (distPl > 5) dir = this.nav.steer(this, pl.pos.x, pl.pos.y, pl.pos.z, game, 3.5, dt);
        }
      } else { // tank or pet
        if (foe && foe.alive) {
          const reach = 2.2 + foe.hw + (foe.def.scale > 1.2 ? foe.def.scale * 0.4 : 0);
          const d = this.dist(foe);
          if (d > reach * 0.85) dir = this.nav.steer(this, foe.pos.x, foe.pos.y, foe.pos.z, game, reach * 0.8, dt);
          else this.faceTo(foe.pos.x, foe.pos.z);
          if (d < reach + 0.3) {
            this.melee(foe, game, dt);
            this.tauntT -= dt;
            if (!this.isPet && this.tauntT <= 0 && foe.target !== this) {
              this.tauntT = 6;
              let top = 0; for (const v of foe.hate.values()) top = Math.max(top, v);
              foe.addHate(this, top - (foe.hate.get(this) || 0) + 30); foe.target = this;
              game.log(`${this.name} taunts ${foe.name} to ignore others and attack him!`, 'other');
            }
          }
        } else if (distPl > 4.5) dir = this.nav.steer(this, pl.pos.x, pl.pos.y, pl.pos.z, game, 3, dt);
      }
      if (distPl > 12) speed = 7;
      if (dir) { this.yaw = Math.atan2(dir.x, dir.z); this.vel.x = dir.x * speed; this.vel.z = dir.z * speed; }
      else { this.vel.x = this.vel.z = 0; if (!foe && !this.casting && distPl < 8) this.faceTo(pl.pos.x, pl.pos.z); }
      const r = physicsMove(game.world, this, dt, true);
      if (dir && (r.blocked || dir.up) && this.onGround) this.vel.y = 7.5;
      if (this.inWater && dir) this.vel.y = Math.max(this.vel.y, 1.5);
      if (dir) this.walkPhase += dt * speed * 2;
      if (this.attackT > 0) { this.attackT += dt * 3; if (this.attackT >= 1) this.attackT = 0; }
      animateModel(this.model, this.walkPhase, !!dir, this.casting ? 0.5 : this.attackT, false);
      this.syncModel();
    }
    melee(foe, game, dt) {
      this.swing -= dt;
      if (this.swing > 0) return;
      const tank = this.role === 'tank', w = this.equip.primary && ITEMS[this.equip.primary.id];
      this.swing = this.isPet ? 2.2 : w && w.delay ? w.delay : tank ? 2.4 : 3.0; this.attackT = 0.01;
      const verb = this.isPet ? 'hits' : w ? { slash: 'slashes', pierce: 'pierces', crush: 'crushes' }[w.verb] || 'hits' : tank ? 'slashes' : 'crushes';
      if (Math.random() > U.clamp(0.72 + (this.level - foe.level) * 0.05, 0.3, 0.95)) { game.log(`${this.name} tries to hit ${foe.name}, but misses!`, 'other'); foe.addHate(this, 1); return; }
      let max = Math.max(2, Math.floor(((tank || this.isPet ? 7 : 5) * 2) * (1 + this.level / 12)));
      if (w && w.dmg) max = Math.max(max, Math.floor(w.dmg * 2 * (1 + this.level / 12)));
      max += Math.floor(this.statSum('STR') / 5);
      const dmg = U.randInt(Math.max(1, Math.floor(max / 4)), max);
      game.log(`${this.name} ${verb} ${foe.name} for ${dmg} points of damage.`, 'other');
      game.damageMob(foe, dmg, this);
    }
  }
  Merc.STANCES = STANCES;
  EB.Merc = Merc;
})();
