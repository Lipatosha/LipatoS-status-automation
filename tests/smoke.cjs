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
vm.runInContext(fs.readFileSync("scripts/main.js","utf8") + "\nglobalThis.unit={collectStatuses,guardEffect,guardActor,guardToken,conditionName,isPlayer};",ctx);
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
assert.ok(!fs.readFileSync("scripts/main.js","utf8").includes("dnd5e.postUseActivity"));
console.log("SMOKE TEST PASSED: active status list, hidden/disabled, locks, GM access, hooks.");
