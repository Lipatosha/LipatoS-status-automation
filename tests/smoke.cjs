const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const hooks = {};
const CONFIG = { statusEffects: [], DND5E: { conditionTypes: {
  prone: {name:"DND5E.ConProne",img:"prone.svg"},
  poisoned: {name:"DND5E.ConPoisoned",img:"poison.svg"}
}}};
const game = { user: {isGM:false}, i18n: {
  has: v => v.startsWith("DND5E."), localize: v => ({ "DND5E.ConProne":"Распластанность", "DND5E.ConPoisoned":"Отравлен" })[v] ?? v
}, modules: new Map([["lipatos-status-automation",{}]]) };
const ctx = {console, CONFIG, game, Hooks:{
 once:(name,fn)=>{hooks[name]=fn;}, on:(name,fn)=>{hooks[name]=fn;}
}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("scripts/main.js","utf8") + "\nglobalThis.unit={collectStatuses,guardEffect,guardActor,guardToken,conditionName,isPlayer,decorateHud,toggleStatusPanel,statusDuration};",ctx);
const api=ctx.unit;
const active={id:"1",name:"Сбит с ног",img:"prone.svg",statuses:new Set(["prone"]),disabled:false,duration:{label:"1 раунд"}};
const disabled={id:"2",name:"Яд",statuses:new Set(["poisoned"]),disabled:true,duration:{}};
const buff={id:"3",name:"Благословение",img:"bless.svg",statuses:new Set(),disabled:false,duration:{}};
const hidden={id:"4",name:"Тайна",statuses:new Set(),disabled:false,isConcealed:true};
const actor={documentName:"Actor",uuid:"Actor.hero",effects:[active,disabled,buff,hidden],statuses:new Set(["prone","poisoned"])};
const items=api.collectStatuses(actor);
assert.equal(items.length,3,"one active condition, one ordinary effect, and one derived status");
assert.equal(items[0].name,"Распластанность");
assert.equal(items[1].name,"Благословение");
assert.equal(items[2].name,"Отравлен");
assert.equal(api.statusDuration({getDurationParts:()=>["Нет"],duration:{label:"Нет"}}),"", "no-duration label is hidden");
assert.equal(api.statusDuration({getDurationParts:()=>["None"],duration:{label:"None"}}),"", "English no-duration label is hidden");
assert.equal(api.statusDuration({duration:{label:"2 раунда"}}),"2 раунда", "real duration is preserved");
assert.equal(api.statusDuration({getDurationParts:()=>["1 раунд","до конца хода"],duration:{}}),"1 раунд · до конца хода");

assert.equal(api.guardEffect({parent:actor}),false);
assert.equal(api.guardEffect({parent:{documentName:"Item"}}),undefined);
assert.equal(api.guardActor(actor,{effects:[]}),false);
assert.equal(api.guardActor(actor,{"effects.0.disabled":true}),false);
assert.equal(api.guardActor(actor,{name:"New name"}),undefined);
assert.equal(api.guardToken({},{"overlayEffect":"skull.svg"}),false);
assert.equal(api.guardToken({},{flags:{core:{statusId:"dead"}}}),false);
assert.equal(api.guardToken({},{x:15}),undefined);
game.user.isGM=true;
assert.equal(api.guardEffect({parent:actor}),undefined);
assert.equal(api.guardActor(actor,{effects:[]}),undefined);
assert.equal(api.guardToken({},{"overlayEffect":"skull.svg"}),undefined);
assert.equal(api.isPlayer(),false);
assert.ok(hooks.renderTokenHUD && hooks.renderActorSheetV2 && hooks.preDeleteActiveEffect);
assert.equal(api.isEffectsPalette?.("effects"), undefined); // Optional exposure checked below.
const source = fs.readFileSync("scripts/main.js", "utf8");
assert.ok(source.includes("function nativeStatusButton(root)"));
assert.ok(source.includes('event.stopImmediatePropagation()'));
assert.ok(source.includes('toggleStatusPanel(hud, button)'));
assert.ok(!source.includes("original.replaceWith(button)"), "native icon/control must remain");
assert.ok(!source.includes("fa-shield-heart"), "custom replacement icon removed");
assert.ok(!source.includes("<span>Статусы</span>"), "no permanent HUD label");

// Simulated native HUD: clicking must keep the stock icon and open the read-only panel.
function fakeElement(tag) {
  const children = [];
  const listeners = {};
  const classes = new Set();
  const el = {
    tag, children, listeners, style: {}, hidden: false, isConnected: false,
    className: "", childNodes: [],
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
    setAttribute(name, value) { this[name] = value; },
    addEventListener(name, callback) { listeners[name] = callback; },
    querySelectorAll() { return []; },
    querySelector(selector) {
      if (selector === ".lpsa-status-view") return this.children.find(c => c.className === "lpsa-status-view") ?? null;
      return null;
    },
    append(...nodes) {
      for (const n of nodes) { n.isConnected = this.isConnected; this.children.push(n); }
    },
    replaceChildren(...nodes) {
      this.children.length = 0;
      this.append(...nodes);
    },
    getBoundingClientRect: () => ({ top: 10, right: 60 }),
    offsetHeight: 100
  };
  return el;
}
const body = fakeElement("body");
body.isConnected = true;
const icon = fakeElement("img");
const native = fakeElement("button");
native.childNodes = [icon];
const hudRoot = fakeElement("div");
hudRoot.querySelector = selector => selector.includes('button[data-action="togglePalette"]') ? native : null;
ctx.document = { body, createElement: fakeElement };
ctx.window = { innerWidth: 1280, innerHeight: 800 };
game.user.isGM = false;
const hud = { actor, element: hudRoot };
api.decorateHud(hud, hudRoot);
assert.equal(native.childNodes[0], icon, "original Foundry status icon must remain unchanged");
assert.equal(native.title, "Статусы", "status label belongs in hover text");
assert.equal(hud._lpsaButton, native);
assert.equal(body.children.length, 0, "no panel is created before click");
let prevented = 0;
let stopped = 0;
native.listeners.click({preventDefault:()=>prevented++,stopImmediatePropagation:()=>stopped++});
assert.equal(prevented, 1);
assert.equal(stopped, 1);
assert.equal(body.children.length, 1);
assert.equal(body.children[0].hidden, false, "native button must open status panel");
assert.equal(body.children[0].children[0].className, "lpsa-status-view");
native.listeners.click({preventDefault:()=>prevented++,stopImmediatePropagation:()=>stopped++});
assert.equal(body.children[0].hidden, true, "second click must close status panel");
assert.equal(prevented, 2);
assert.equal(stopped, 2);
assert.ok(!fs.readFileSync("scripts/main.js","utf8").includes("dnd5e.postUseActivity"));
console.log("SMOKE TEST PASSED: active statuses, player locks, GM access, native icon, click opens/closes panel.");
