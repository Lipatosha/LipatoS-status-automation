const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const ID = "lipatos-status-automation";
const hooks = {};
const damage = [];
const messages = [];
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  Hooks: {
    once: (name, fn) => { hooks[name] = fn; },
    on: (name, fn) => { hooks[name] = fn; }
  },
  CONFIG: {
    statusEffects: [{ id: "poisoned", name: "Poisoned", img: "poison.svg" }],
    DND5E: { damageTypes: { poison: { label: "Poison" } }, abilities: { con: { label: "Constitution" } } }
  },
  game: {
    combat: { id: "combat1" },
    user: { id: "GM", isGM: true },
    users: [{ id: "GM", active: true, isGM: true }],
    modules: new Map([[ID, {}]]),
    i18n: { localize: x => x }
  },
  ui: { notifications: { info() {}, warn() {}, error: msg => { throw new Error(msg); } } },
  ChatMessage: {
    getSpeaker: () => ({}),
    create: async payload => messages.push(payload)
  },
  Roll: class {
    constructor(formula) { this.formula = formula; this.total = 3; }
    async evaluate() { return this; }
    async toMessage() {}
  },
  foundry: { utils: { randomID: () => "test-id" } }
};
vm.createContext(sandbox);
const code = fs.readFileSync("scripts/main.js", "utf8");
vm.runInContext(code + "\nglobalThis.tests = { cleanRule, applyRule, tickEffect };", sandbox);
const { cleanRule, applyRule, tickEffect } = sandbox.tests;
assert.equal(cleanRule({ trigger: "native" }).trigger, "native");
assert.equal(cleanRule({ formula: "1d4+@abilities.con.mod", rounds: 2 }).rounds, 2);
assert.equal(cleanRule({ rounds: 0 }).rounds, 0);
assert.throws(() => cleanRule({ formula: "1d4;alert(1)" }), /формула/);

const actor = {
  name: "Test Hero",
  uuid: "Actor.hero",
  system: { traits: { ci: { value: new Set(["poisoned"]) } } },
  effects: [],
  getRollData: () => ({}),
  async applyDamage(parts) { damage.push(parts[0]); },
  async createEmbeddedDocuments(type, list) {
    assert.equal(type, "ActiveEffect");
    for (const source of list) {
      const effect = {
        name: source.name,
        parent: actor,
        disabled: false,
        statuses: new Set(source.statuses),
        flags: source.flags,
        getFlag(id, key) { return id === ID && key === "state" ? this.flags[ID].state : null; },
        async update(patch) {
          const base = "flags." + ID + ".state";
          if (patch[base]) this.flags[ID].state = patch[base];
          if (Object.hasOwn(patch, base + ".lastEdge")) this.flags[ID].state.lastEdge = patch[base + ".lastEdge"];
          if (Object.hasOwn(patch, base + ".remaining")) this.flags[ID].state.remaining = patch[base + ".remaining"];
        },
        async delete() { this.parent = null; actor.effects.splice(actor.effects.indexOf(this), 1); }
      };
      actor.effects.push(effect);
    }
  }
};
const item = { uuid: "Actor.source.Item.poison", name: "Poison Claw", actor: { uuid: "Actor.source" }, img: "claw.svg" };
const rule = cleanRule({
  enabled: true, status: "poisoned", name: "Poison Claw", rounds: 2, timing: "start",
  formula: "1d4", damageType: "poison", prompt: false
});
(async () => {
  await applyRule(actor, item, rule, "attack");
  assert.equal(actor.effects.length, 1);
  assert.deepEqual([...actor.effects[0].statuses], [], "condition immunity excludes status, not damage");
  assert.equal(actor.effects[0].flags[ID].state.remaining, 2);
  const effect = actor.effects[0];
  await tickEffect(actor, effect, effect.flags[ID].state, "combat1:1:0:hero:start");
  assert.equal(damage.length, 1);
  assert.equal(damage[0].type, "poison");
  assert.equal(effect.flags[ID].state.remaining, 1);
  await tickEffect(actor, effect, effect.flags[ID].state, "combat1:1:0:hero:start");
  assert.equal(damage.length, 1, "same edge must not deal damage twice");
  await tickEffect(actor, effect, effect.flags[ID].state, "combat1:2:0:hero:start");
  assert.equal(damage.length, 2);
  assert.equal(actor.effects.length, 0, "effect removed after second tick");
  await applyRule(actor, item, rule, "attack");
  await applyRule(actor, item, rule, "attack");
  assert.equal(actor.effects.length, 1, "same source refreshes rather than stacks");
  assert.equal(actor.effects[0].flags[ID].state.remaining, 2);
  await applyRule(actor, item, cleanRule({ ...rule, rounds: 0, formula: "" }), "attack");
  const indefinite = actor.effects[0];
  await tickEffect(actor, indefinite, indefinite.flags[ID].state, "combat1:3:0:hero:end");
  assert.equal(actor.effects.length, 1, "indefinite condition persists");
  await indefinite.delete();
  console.log("SMOKE TEST PASSED: rule validation, immunity, damage, dedupe, expiry, refresh, indefinite.");
})().catch(error => { console.error(error); process.exitCode = 1; });
