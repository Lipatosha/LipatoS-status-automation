/* LipatoS — Автоматизация состояний и эффектов | Foundry 14 / D&D5e 6.0.5 */
const ID = "lipatos-status-automation";
const CHANNEL = "module." + ID;
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder", "healing"];
const pending = new Map();
let turnQueue = Promise.resolve();
const usedRolls = new WeakSet();

function report(error) {
  console.error(ID, error);
  ui.notifications?.error("LipatoS — Автоэффекты: " + (error?.message ?? String(error)));
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function gm() {
  return game.users.filter(u => u.active && u.isGM).sort((a, b) => a.id.localeCompare(b.id))[0];
}
function isPrimaryGM() { return game.user?.isGM && gm()?.id === game.user.id; }
function statuses() {
  const source = CONFIG.statusEffects ?? [];
  return (Array.isArray(source) ? source : Object.values(source)).filter(s => s && typeof s.id === "string");
}
function statusInfo(id) {
  return statuses().find(s => s.id === id);
}
function ruleFor(item, activity) {
  if (!item) return null;
  const rules = item.getFlag(ID, "rules") ?? {};
  const key = activity?.id ?? "default";
  return rules[key] ?? rules.default ?? null;
}
function cleanRule(raw) {
  const input = raw ?? {};
  const formula = String(input.formula ?? "").trim();
  if (formula.length > 120 || (formula && !/^[\w@.+\-*/() \[\]dD]+$/.test(formula))) throw new Error("Недопустимая формула урона.");
  const rounds = Math.min(1000, Math.max(1, Number.parseInt(input.rounds, 10) || 1));
  const dc = Math.min(40, Math.max(1, Number.parseInt(input.dc, 10) || 10));
  return {
    enabled: input.enabled === true || input.enabled === "true" || input.enabled === "on",
    name: String(input.name ?? "").trim().slice(0, 90),
    trigger: ["hit", "native"].includes(input.trigger) ? input.trigger : "use",
    status: statusInfo(input.status) ? input.status : "",
    rounds,
    timing: ["start", "end", "sourceStart", "sourceEnd"].includes(input.timing) ? input.timing : "start",
    formula,
    damageType: DAMAGE_TYPES.includes(input.damageType) ? input.damageType : "poison",
    saveAbility: ABILITIES.includes(input.saveAbility) ? input.saveAbility : "",
    dc,
    success: ["end", "half", "none", "full"].includes(input.success) ? input.success : "end",
    prompt: input.prompt === true || input.prompt === "true" || input.prompt === "on"
  };
}
function option(value, label, current) {
  return '<option value="' + esc(value) + '"' + (value === current ? " selected" : "") + ">" + esc(label) + "</option>";
}
function select(name, options) {
  return '<select name="' + esc(name) + '">' + options.join("") + "</select>";
}
function field(label, control, help = "") {
  return '<label class="lpsa-field"><span>' + esc(label) + "</span>" + control +
    (help ? '<small>' + esc(help) + "</small>" : "") + "</label>";
}
function activities(item) {
  const list = Array.from(item.system?.activities?.values?.() ?? []);
  return list.map(a => ({ id: a.id, label: a.name || a.type || a.id }));
}
async function configureItem(item) {
  if (!game.user.isGM) return;
  const choices = activities(item);
  let activityId = choices[0]?.id ?? "default";
  if (choices.length > 1) {
    const pick = await foundry.applications.api.DialogV2.input({
      window: { title: "Автоэффекты — " + item.name },
      content: field("Действие предмета", select("activityId", choices.map(a => option(a.id, a.label, activityId)))),
      ok: { label: "Настроить" }, rejectClose: false
    });
    if (!pick) return;
    activityId = String(pick.activityId);
  }
  const old = item.getFlag(ID, "rules")?.[activityId] ?? {};
  const rule = cleanRule({ rounds: 2, name: item.name, prompt: true, ...old });
  const statusOptions = [option("", "Без состояния", rule.status)].concat(
    statuses().map(s => option(s.id, game.i18n.localize(s.name ?? s.label ?? s.id), rule.status))
  );
  const typeOptions = DAMAGE_TYPES.map(type =>
    option(type, game.i18n.localize(CONFIG.DND5E?.damageTypes?.[type]?.label ?? type), rule.damageType));
  const saveOptions = [option("", "Без спасброска", rule.saveAbility)].concat(
    ABILITIES.map(a => option(a, game.i18n.localize(CONFIG.DND5E?.abilities?.[a]?.label ?? a), rule.saveAbility)));
  const check = (key, checked) => '<input name="' + key + '" type="checkbox"' + (checked ? " checked" : "") + ">";
  const text = (key, val, type = "text", attrs = "") =>
    '<input name="' + key + '" type="' + type + '" value="' + esc(val) + '" ' + attrs + ">";
  const content = '<div class="lpsa-editor">' +
    field("Включить автоматизацию", check("enabled", rule.enabled)) +
    field("Название эффекта", text("name", rule.name)) +
    field("Условие наложения", select("trigger", [
      option("use", "При использовании действия (без проверки попадания)", rule.trigger),
      option("hit", "После броска атаки при попадании", rule.trigger),
      option("native", "При штатном наложении эффекта D&D5e (с учётом спасброска)", rule.trigger)
    ]), "Для способностей со спасброском используй штатное применение эффекта либо режим при использовании.") +
    field("Состояние на цели", select("status", statusOptions)) +
    field("Количество срабатываний", text("rounds", rule.rounds, "number", 'min="1" max="1000"')) +
    field("Момент срабатывания", select("timing", [
      option("start", "Начало хода цели", rule.timing),
      option("end", "Конец хода цели", rule.timing),
      option("sourceStart", "Начало хода источника", rule.timing),
      option("sourceEnd", "Конец хода источника", rule.timing)
    ])) +
    field("Формула урона / лечения", text("formula", rule.formula, "text", 'placeholder="1d4"'),
      "Пустая формула — только состояние. Используются обычные формулы кубиков Foundry.") +
    field("Тип", select("damageType", typeOptions)) +
    field("Повторный спасбросок", select("saveAbility", saveOptions)) +
    field("Сложность спасброска", text("dc", rule.dc, "number", 'min="1" max="40"')) +
    field("При успешном спасброске", select("success", [
      option("end", "Снять эффект до нанесения урона", rule.success),
      option("half", "Половина урона; эффект остаётся", rule.success),
      option("none", "Без урона; эффект остаётся", rule.success),
      option("full", "Полный урон; эффект остаётся", rule.success)
    ])) +
    field("Показывать окно перед срабатыванием", check("prompt", rule.prompt)) +
    '<p class="notes">Отдельные источники не удаляют друг у друга одноимённые состояния. Вся обработка изменений выполняется ведущим ГМ.</p></div>';
  const data = await foundry.applications.api.DialogV2.input({
    window: { title: "Автоэффекты — " + item.name + " / " + (choices.find(a => a.id === activityId)?.label ?? "Предмет") },
    position: { width: 530 }, content, ok: { label: "Сохранить" }, rejectClose: false
  });
  if (!data) return;
  try {
    const fresh = cleanRule(data);
    await item.update({ ["flags." + ID + ".rules." + activityId]: fresh });
    ui.notifications.info("LipatoS: автоматизация сохранена для «" + item.name + "».");
  } catch (error) { report(error); }
}
function insertButton(app, element) {
  const item = app.document ?? app.object;
  if (item?.documentName !== "Item" || !game.user?.isGM) return;
  const root = element?.jquery ? element[0] : element;
  if (!root?.querySelector) return;
  const header = root.querySelector(".window-header");
  if (!header || header.querySelector(".lpsa-header")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "lpsa-header";
  button.title = "Автоматизация состояний";
  button.innerHTML = '<i class="fas fa-skull-crossbones"></i><span> Автоэффекты</span>';
  button.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); configureItem(item).catch(report); });
  header.insertBefore(button, header.querySelector(".window-controls") ?? null);
}
function getTargets() {
  return Array.from(game.user.targets ?? []).map(t => t.document?.uuid ?? t.uuid).filter(Boolean);
}
function sendRequest(item, activity, trigger, total, natural) {
  const rule = ruleFor(item, activity);
  if (!rule?.enabled || rule.trigger !== trigger) return;
  const targets = getTargets();
  if (!targets.length) {
    ui.notifications.warn("LipatoS: сперва выбери цель клавишей T.");
    return;
  }
  const request = { type: "apply", userId: game.user.id, itemUuid: item.uuid,
    activityId: activity?.id ?? "default", trigger, targets, total, natural };
  if (isPrimaryGM()) return applyRequest(request, game.user.id).catch(report);
  if (!gm()) return ui.notifications.warn("LipatoS: для автоматизации требуется активный ГМ.");
  game.socket.emit(CHANNEL, request);
}
async function applyRequest(request, senderId) {
  if (!isPrimaryGM() || request.userId !== senderId) return;
  const user = game.users.get(senderId);
  const item = await fromUuid(request.itemUuid);
  if (!user || item?.documentName !== "Item" || !item.actor?.testUserPermission(user, "OWNER")) return;
  const activity = item.system?.activities?.get?.(request.activityId) ?? null;
  const rule = ruleFor(item, activity);
  if (!rule?.enabled || rule.trigger !== request.trigger) return;
  if (request.trigger === "hit" && (!Number.isFinite(request.total) || !Number.isInteger(request.natural))) return;
  for (const uuid of [...new Set(request.targets ?? [])].slice(0, 30)) {
    const target = await fromUuid(uuid);
    const actor = target?.actor ?? (target?.documentName === "Actor" ? target : null);
    if (!actor) continue;
    if (request.trigger === "hit") {
      const ac = Number(actor.system?.attributes?.ac?.value);
      if (!Number.isFinite(ac) || (request.natural !== 20 && (request.natural === 1 || request.total < ac))) continue;
    }
    await applyRule(actor, item, rule, request.activityId);
  }
}
async function applyRule(actor, item, rule, activityId) {
  const conditionImmunities = actor.system?.traits?.ci?.value ?? [];
  const immunity = conditionImmunities instanceof Set ? conditionImmunities.has(rule.status)
    : Array.isArray(conditionImmunities) && conditionImmunities.includes(rule.status);
  if (rule.status && immunity) {
    ui.notifications.info(actor.name + ": иммунитет к состоянию «" + rule.status + "».");
    return;
  }
  const combat = game.combat;
  const code = item.uuid + ":" + activityId;
  const existing = actor.effects.find(e => e.getFlag(ID, "state")?.sourceKey === code);
  const state = {
    sourceKey: code, sourceActorUuid: item.actor.uuid, sourceItemUuid: item.uuid,
    remaining: rule.rounds, timing: rule.timing, formula: rule.formula,
    damageType: rule.damageType, saveAbility: rule.saveAbility, dc: rule.dc,
    success: rule.success, prompt: rule.prompt, lastEdge: "",
    combatId: combat?.id ?? null
  };
  if (existing) {
    await existing.update({ disabled: false, ["flags." + ID + ".state"]: state });
    return;
  }
  const status = statusInfo(rule.status);
  const name = rule.name || item.name;
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name, img: status?.img ?? status?.icon ?? item.img ?? "icons/svg/aura.svg",
    origin: item.uuid, statuses: rule.status ? [rule.status] : [],
    duration: {}, changes: [],
    flags: { [ID]: { state } }
  }]);
}

async function onNativeEffect(effect) {
  if (!isPrimaryGM() || effect.parent?.documentName !== "Actor" || effect.getFlag(ID, "state")) return;
  const origin = effect.system?.origin ?? {};
  const itemRef = origin.item || effect.origin;
  if (!itemRef || typeof itemRef !== "string") return;
  const resolved = await fromUuid(itemRef);
  const item = resolved?.documentName === "Item" ? resolved : resolved?.item;
  if (!item?.actor) return;
  const activityRef = origin.activity;
  const activityId = typeof activityRef === "string" ? activityRef.split(".").at(-1) : "default";
  const rules = item.getFlag(ID, "rules") ?? {};
  let rule = rules[activityId] ?? rules.default;
  if (!rule && Object.keys(rules).length === 1) rule = Object.values(rules)[0];
  if (!rule?.enabled || rule.trigger !== "native") return;
  const data = cleanRule(rule);
  const status = data.status;
  const immunities = effect.parent.system?.traits?.ci?.value ?? [];
  if (status && (immunities instanceof Set ? immunities.has(status) : Array.from(immunities).includes(status))) return;
  const combat = game.combat;
  const state = {
    sourceKey: item.uuid + ":" + activityId, sourceActorUuid: item.actor.uuid,
    sourceItemUuid: item.uuid, remaining: data.rounds, timing: data.timing,
    formula: data.formula, damageType: data.damageType, saveAbility: data.saveAbility,
    dc: data.dc, success: data.success, prompt: data.prompt, lastEdge: "",
    combatId: combat?.id ?? null
  };
  const patch = { ["flags." + ID + ".state"]: state };
  if (status && !effect.statuses?.has(status)) patch.statuses = [...(effect.statuses ?? []), status];
  await effect.update(patch);
}

function actorOwner(actor) {
  return game.users.filter(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"))
    .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}
async function askPlayer(actor, effect, data) {
  const owner = actorOwner(actor);
  if (!owner || !game.socket) return false;
  const requestId = foundry.utils.randomID();
  const result = new Promise(resolve => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      resolve(null);
    }, 45000);
    pending.set(requestId, { userId: owner.id, actorUuid: actor.uuid, resolve: value => {
      clearTimeout(timer); pending.delete(requestId); resolve(value);
    } });
  });
  game.socket.emit(CHANNEL, { type: "prompt", recipient: owner.id, requestId,
    actorUuid: actor.uuid, effectName: effect.name, formula: data.formula,
    damageType: data.damageType, ability: data.saveAbility, dc: data.dc });
  const reply = await result;
  return reply === true;
}
async function handlePrompt(message) {
  if (message.recipient !== game.user.id || game.user.isGM) return;
  const actor = await fromUuid(message.actorUuid);
  if (!actor?.testUserPermission(game.user, "OWNER")) return;
  const content = '<p><strong>' + esc(actor.name) + " — " + esc(message.effectName) +
    '</strong></p><p>' + (message.ability
      ? "Спасбросок " + esc(game.i18n.localize(CONFIG.DND5E?.abilities?.[message.ability]?.label ?? message.ability)) +
        ", Сл " + esc(message.dc) + "."
      : "Срабатывает периодический эффект.") + "</p>" +
    (message.formula ? "<p>Формула: " + esc(message.formula) + " (" + esc(message.damageType) + ")</p>" : "");
  const reply = await foundry.applications.api.DialogV2.wait({
    window: { title: "LipatoS — Периодический эффект" },
    content, modal: true, rejectClose: false,
    buttons: [{ action: "ok", label: message.ability ? "Продолжить к спасброску" : "Продолжить", default: true,
      callback: () => true }]
  });
  game.socket.emit(CHANNEL, { type: "promptReply", requestId: message.requestId, userId: game.user.id,
    actorUuid: message.actorUuid, accepted: reply === true });
}
async function onSocket(message, senderId) {
  if (!message || typeof message !== "object") return;
  if (message.type === "prompt") return handlePrompt(message).catch(report);
  if (message.type === "promptReply" && isPrimaryGM()) {
    const p = pending.get(message.requestId);
    if (p && p.userId === message.userId && p.actorUuid === message.actorUuid &&
        (!senderId || senderId === message.userId)) p.resolve(message.accepted === true);
  }
  if (message.type === "apply" && isPrimaryGM()) {
    if (senderId && senderId !== message.userId) return;
    await applyRequest(message, senderId ?? message.userId);
  }
}
async function rollSave(actor, ability, dc) {
  const rolls = await actor.rollSavingThrow({ ability, target: dc }, { configure: false });
  if (!rolls?.length || !Number.isFinite(rolls[0]?.total)) return null;
  return rolls[0].total >= dc;
}
async function tickEffect(actor, effect, state, edge) {
  if (!effect.parent || effect.disabled) return;
  const current = effect.getFlag(ID, "state");
  if (!current || current.lastEdge === edge || current.remaining <= 0) return;
  // Claim the edge before any asynchronous dialog so a duplicated hook cannot deal damage twice.
  await effect.update({ ["flags." + ID + ".state.lastEdge"]: edge });
  const prompt = !!current.prompt;
  if (prompt) await askPlayer(actor, effect, current);
  let multiplier = 1;
  if (current.saveAbility) {
    const success = await rollSave(actor, current.saveAbility, Number(current.dc));
    if (success === null) {
      ui.notifications.warn("LipatoS: спасбросок отменён; эффект «" + effect.name + "» не обработан.");
      await effect.update({ ["flags." + ID + ".state.lastEdge"]: "" });
      return;
    }
    if (success) {
      if (current.success === "end") {
        await effect.delete();
        await ChatMessage.create({ content: esc(actor.name) + ": эффект «" + esc(effect.name) +
          "» завершён успешным спасброском.", speaker: ChatMessage.getSpeaker({ actor }) });
        return;
      }
      if (current.success === "half") multiplier = 0.5;
      if (current.success === "none") multiplier = 0;
    }
  }
  if (current.formula && multiplier !== 0) {
    const roll = await new Roll(current.formula, actor.getRollData()).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }),
      flavor: esc(effect.name) + " — " + esc(actor.name) + " (" + esc(current.damageType) + ")" });
    const value = Math.floor(roll.total * multiplier);
    if (value > 0 && typeof actor.applyDamage === "function") {
      await actor.applyDamage([{ value, type: current.damageType, properties: new Set() }]);
    }
  }
  const remaining = Number(current.remaining) - 1;
  if (remaining <= 0) {
    await effect.delete();
    await ChatMessage.create({ content: esc(actor.name) + ": эффект «" + esc(effect.name) +
      "» завершился.", speaker: ChatMessage.getSpeaker({ actor }) });
  } else await effect.update({ ["flags." + ID + ".state.remaining"]: remaining });
}
async function processEdge(combat, combatant, edgeName, round, turn) {
  if (!combatant?.actor) return;
  const actor = combatant.actor;
  const edge = [combat.id, round, turn, combatant.id, edgeName].join(":");
  for (const target of combat.combatants) {
    const afflicted = target.actor;
    if (!afflicted) continue;
    for (const effect of Array.from(afflicted.effects)) {
      const state = effect.getFlag(ID, "state");
      if (!state || state.combatId && state.combatId !== combat.id) continue;
      const sourceEdge = state.timing === "sourceStart" || state.timing === "sourceEnd";
      const matches = sourceEdge ? state.sourceActorUuid === actor.uuid : afflicted.uuid === actor.uuid;
      if (!matches) continue;
      const wanted = state.timing.endsWith("End") || state.timing === "end" ? "end" : "start";
      if (wanted !== edgeName) continue;
      try { await tickEffect(afflicted, effect, state, edge); } catch (error) { report(error); }
    }
  }
}
async function onCombatChange(combat, changed) {
  if (!isPrimaryGM() || !Object.hasOwn(changed, "round") && !Object.hasOwn(changed, "turn")) return;
  if (!combat.started) return;
  const before = combat.previous;
  if (before?.combatantId) {
    const previous = combat.combatants.get(before.combatantId);
    await processEdge(combat, previous, "end", before.round ?? combat.round, before.turn ?? combat.turn);
  }
  await processEdge(combat, combat.combatant, "start", combat.round, combat.turn);
}
Hooks.once("init", () => {
  game.modules.get(ID).api = {
    configureItem,
    apply: async (actor, item, override, activityId = "default") => {
      if (!isPrimaryGM()) throw new Error("Применение эффектов разрешено только ведущему ГМ.");
      return applyRule(actor, item, cleanRule({ enabled: true, rounds: 2, ...override }), activityId);
    }
  };
});
Hooks.once("ready", () => {
  game.socket.on(CHANNEL, (message, userId) => onSocket(message, userId).catch(report));
});
Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
  const item = app.document ?? app.object;
  if (item?.documentName === "Item" && game.user?.isGM) {
    controls.push({ action: "lipatos-status-automation", label: "Автоэффекты",
      icon: "fas fa-skull-crossbones", onClick: () => configureItem(item).catch(report) });
  }
});
Hooks.on("renderApplicationV2", (app, element) => insertButton(app, element));
Hooks.on("renderItemSheet", (app, element) => insertButton(app, element));
Hooks.on("dnd5e.postUseActivity", (activity) => {
  const item = activity?.item;
  if (item) sendRequest(item, activity, "use");
});
Hooks.on("dnd5e.postRollAttack", (rolls, data) => {
  const activity = data?.subject;
  const item = activity?.item;
  const roll = rolls?.[0];
  if (!item || !roll || usedRolls.has(roll)) return;
  usedRolls.add(roll);
  const die = roll.dice?.find(d => d.faces === 20);
  const natural = die?.results?.find(r => r.active !== false && !r.discarded)?.result;
  if (!Number.isFinite(roll.total) || !Number.isInteger(natural)) return;
  sendRequest(item, activity, "hit", roll.total, natural);
});
Hooks.on("createActiveEffect", effect => { onNativeEffect(effect).catch(report); });
Hooks.on("updateCombat", (combat, changed) => {
  turnQueue = turnQueue.then(() => onCombatChange(combat, changed)).catch(report);
});
