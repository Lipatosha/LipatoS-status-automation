/* LipatoS — Статусы | Foundry VTT 14 / dnd5e 6.0.5
 * Read-only player status viewer. All GM controls stay native.
 */
const ID = "lipatos-status-automation";
const views = new Set();
const descriptions = new Map();
const tooltip = { element: null, request: 0 };

const FALLBACK_RULES = Object.freeze({
  blinded: "<ul><li>Существо не видит и проваливает проверки, требующие зрения.</li><li>Атаки по существу совершаются с преимуществом, его собственные атаки — с помехой.</li></ul>",
  charmed: "<ul><li>Не может атаковать очаровавшее его существо или выбирать его целью вредоносных эффектов.</li><li>Очаровавший имеет преимущество на социальные проверки против цели.</li></ul>",
  deafened: "<ul><li>Существо не слышит и автоматически проваливает проверки, для которых необходим слух.</li></ul>",
  frightened: "<ul><li>Получает помеху на атаки и проверки характеристик, пока источник страха виден.</li><li>Не может добровольно приблизиться к источнику страха.</li></ul>",
  grappled: "<ul><li>Скорость становится равна 0.</li><li>Состояние прекращается, если захвативший недееспособен или цель оказывается вне досягаемости захвата.</li></ul>",
  incapacitated: "<ul><li>Не может совершать действия и реакции.</li></ul>",
  invisible: "<ul><li>Невидимо без помощи магии или особых чувств; местоположение может быть обнаружено по шуму и следам.</li><li>Атаки по нему совершаются с помехой, его атаки — с преимуществом по правилам 2014 года.</li></ul>",
  paralyzed: "<ul><li>Недееспособно, не может двигаться и говорить.</li><li>Проваливает спасброски Силы и Ловкости.</li><li>Атаки по цели имеют преимущество; попадания с расстояния до 5 футов считаются критическими.</li></ul>",
  petrified: "<ul><li>Превращено в неподвижное вещество и недееспособно.</li><li>Не ощущает окружение, проваливает спасброски Силы и Ловкости.</li><li>Атаки по нему имеют преимущество; получает сопротивление всему урону.</li></ul>",
  poisoned: "<ul><li>Совершает броски атаки и проверки характеристик с помехой.</li></ul>",
  prone: "<ul><li>Может передвигаться только ползком, пока не встанет.</li><li>Совершает броски атаки с помехой.</li><li>Атаки по нему с расстояния до 5 футов имеют преимущество, остальные — помеху.</li></ul>",
  restrained: "<ul><li>Скорость становится равна 0.</li><li>Атаки по нему имеют преимущество; его атаки и спасброски Ловкости — с помехой.</li></ul>",
  stunned: "<ul><li>Недееспособно, не может двигаться, может говорить лишь запинаясь.</li><li>Проваливает спасброски Силы и Ловкости, атаки по нему совершаются с преимуществом.</li></ul>",
  unconscious: "<ul><li>Недееспособно, не может двигаться, говорить и осознавать окружение.</li><li>Роняет удерживаемые предметы и падает ничком.</li><li>Проваливает спасброски Силы и Ловкости; атаки по нему с преимуществом, попадания в пределах 5 футов критические.</li></ul>"
});

function isPlayer() { return !!game.user && !game.user.isGM; }
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function localize(value) {
  if (!value) return "";
  return game.i18n?.has?.(value) ? game.i18n.localize(value) : String(value);
}
function conditionConfig(id) {
  return CONFIG.DND5E?.conditionTypes?.[id] ??
    (Array.isArray(CONFIG.statusEffects)
      ? CONFIG.statusEffects.find(s => s.id === id)
      : CONFIG.statusEffects?.[id]) ?? {};
}
function conditionName(id) {
  const info = conditionConfig(id);
  return localize(info.name ?? info.label ?? id);
}
function effectVisible(effect) {
  if (effect.disabled || effect.duration?.expired || effect.isSuppressed) return false;
  try { if (effect.isConcealed) return false; } catch (_) { /* Other system model */ }
  return true;
}
function collectStatuses(actor) {
  const entries = [];
  const seen = new Set();
  if (!actor) return entries;
  for (const effect of actor.effects ?? []) {
    if (!effectVisible(effect)) continue;
    const ids = Array.from(effect.statuses ?? []).filter(Boolean);
    if (!ids.length) {
      entries.push({ key: "effect:" + effect.id, statusId: "", name: effect.name,
        img: effect.img, effect, source: "", description: effect.description ?? "" });
      continue;
    }
    for (const id of ids) {
      seen.add(id);
      const cfg = conditionConfig(id);
      entries.push({ key: "status:" + id + ":" + effect.id, statusId: id,
        name: conditionName(id), img: cfg.img ?? cfg.icon ?? effect.img,
        effect, source: effect.name === conditionName(id) ? "" : effect.name,
        description: effect.description ?? "" });
    }
  }
  // A system or module may expose derived statuses without a dedicated actor effect.
  for (const id of actor.statuses ?? []) {
    if (seen.has(id)) continue;
    const cfg = conditionConfig(id);
    entries.push({ key: "derived:" + id, statusId: id, name: conditionName(id),
      img: cfg.img ?? cfg.icon ?? "icons/svg/aura.svg", effect: null, source: "", description: "" });
  }
  return entries;
}
function statusDuration(effect) {
  if (!effect) return "";
  try {
    const parts = effect.getDurationParts?.();
    if (parts?.length) return parts.filter(Boolean).join(" · ");
  } catch (_) { /* Some effects have no duration formatter */ }
  return effect.duration?.label ?? "";
}
function viewElement(actor) {
  const view = document.createElement("section");
  view.className = "lpsa-status-view";
  view._lpsaActor = actor;
  views.add(view);
  renderView(view);
  return view;
}
function renderView(view) {
  const actor = view._lpsaActor;
  const statuses = collectStatuses(actor);
  view.replaceChildren();
  const header = document.createElement("h3");
  header.className = "lpsa-list-title";
  header.textContent = "Активные статусы";
  view.append(header);
  if (!statuses.length) {
    const empty = document.createElement("p");
    empty.className = "lpsa-empty";
    empty.textContent = "На персонаже нет активных статусов.";
    view.append(empty);
    return;
  }
  const list = document.createElement("ul");
  list.className = "lpsa-list";
  for (const entry of statuses) {
    const row = document.createElement("li");
    row.className = "lpsa-status-row";
    row.tabIndex = 0;
    row.setAttribute("aria-label", entry.name);
    const icon = document.createElement("img");
    icon.className = "lpsa-status-icon";
    icon.src = entry.img || "icons/svg/aura.svg";
    icon.alt = "";
    const text = document.createElement("span");
    text.className = "lpsa-status-text";
    const name = document.createElement("strong");
    name.textContent = entry.name;
    text.append(name);
    if (entry.source) {
      const source = document.createElement("small");
      source.textContent = entry.source;
      text.append(source);
    }
    const duration = statusDuration(entry.effect);
    if (duration) {
      const d = document.createElement("small");
      d.className = "lpsa-duration";
      d.textContent = duration;
      text.append(d);
    }
    row.append(icon, text);
    row.addEventListener("mouseenter", event => showTooltip(entry, event));
    row.addEventListener("focus", event => showTooltip(entry, event));
    row.addEventListener("mousemove", positionTooltip);
    row.addEventListener("mouseleave", hideTooltip);
    row.addEventListener("blur", hideTooltip);
    list.append(row);
  }
  view.append(list);
}
function refreshViews(actor) {
  for (const view of views) {
    if (!view.isConnected) { views.delete(view); continue; }
    if (!actor || view._lpsaActor?.uuid === actor.uuid) renderView(view);
  }
}
function normalizeRules(html) {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  if (isPlayer()) holder.querySelectorAll(".secret, [data-secret], script, iframe, object").forEach(el => el.remove());
  return holder.innerHTML;
}
async function rulesDescription(entry) {
  const cfg = conditionConfig(entry.statusId);
  const reference = cfg.reference;
  if (reference) {
    let result = descriptions.get(reference);
    if (!result) {
      result = (async () => {
        try {
          const doc = await fromUuid(reference);
          if (!doc || (doc.testUserPermission && !doc.testUserPermission(game.user, "OBSERVER"))) return "";
          const html = doc.text?.content ?? doc.content ?? "";
          if (!html) return "";
          return await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            html, { async: true, secrets: game.user.isGM, documents: true, links: true });
        } catch (error) {
          console.warn(ID, "Не удалось загрузить описание состояния", reference, error);
          return "";
        }
      })();
      descriptions.set(reference, result);
    }
    const resultHtml = await result;
    if (resultHtml) return normalizeRules(resultHtml);
  }
  if (entry.statusId && FALLBACK_RULES[entry.statusId]) return FALLBACK_RULES[entry.statusId];
  if (entry.description) {
    try {
      const html = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        entry.description, { async: true, secrets: game.user.isGM, documents: true, links: true });
      return normalizeRules(html);
    } catch (_) { /* Keep text fallback */ }
    return "<p>" + esc(entry.description.replace(/<[^>]*>/g, " ")) + "</p>";
  }
  return "<p>Описание отсутствует.</p>";
}
function tooltipElement() {
  if (tooltip.element?.isConnected) return tooltip.element;
  const el = document.createElement("aside");
  el.className = "lpsa-tooltip";
  el.setAttribute("role", "tooltip");
  el.hidden = true;
  document.body.append(el);
  tooltip.element = el;
  return el;
}
function positionTooltip(event) {
  const el = tooltip.element;
  if (!el || el.hidden) return;
  const x = Number.isFinite(event.clientX) ? event.clientX : window.innerWidth / 2;
  const y = Number.isFinite(event.clientY) ? event.clientY : window.innerHeight / 2;
  const width = Math.min(390, window.innerWidth - 20);
  const left = Math.max(10, Math.min(x + 18, window.innerWidth - width - 10));
  const top = Math.max(10, Math.min(y + 12, window.innerHeight - Math.min(el.offsetHeight, window.innerHeight - 20) - 10));
  el.style.left = left + "px";
  el.style.top = top + "px";
}
async function showTooltip(entry, event) {
  const serial = ++tooltip.request;
  const el = tooltipElement();
  el.innerHTML = '<div class="lpsa-tooltip-header"><strong>' + esc(entry.name) +
    '</strong><span>Состояние</span></div><div class="lpsa-tooltip-body">Загрузка описания…</div>';
  el.hidden = false;
  positionTooltip(event);
  const body = el.querySelector(".lpsa-tooltip-body");
  const html = await rulesDescription(entry);
  if (serial !== tooltip.request || !el.isConnected) return;
  body.innerHTML = html;
  positionTooltip(event);
}
function hideTooltip() {
  tooltip.request++;
  if (tooltip.element) tooltip.element.hidden = true;
}
function placePanel(panel, anchor) {
  if (!panel || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(320, window.innerWidth - 24);
  panel.style.left = Math.max(12, Math.min(rect.right + 8, window.innerWidth - width - 12)) + "px";
  panel.style.top = Math.max(12, Math.min(rect.top, window.innerHeight - Math.min(panel.offsetHeight || 300, window.innerHeight - 24) - 12)) + "px";
}
function decorateHud(hud, supplied) {
  if (!isPlayer()) return;
  const root = supplied?.jquery ? supplied[0] : supplied ?? hud.element;
  const actor = hud.actor ?? hud.object?.actor;
  if (!root?.querySelector || !actor) return;
  if (root.querySelector(".lpsa-status-button")) return;
  const original = root.querySelector(
    'button[data-action="togglePalette"][data-palette="effects"],' +
    'button[data-action="togglePalette"][data-palette="status"],' +
    'button[data-action="togglePalette"][data-palette="statuses"],' +
    'button[data-action="toggleEffects"],button[data-action="toggleStatusEffects"],' +
    'button.control-icon[data-action="effects"],button.control-icon[data-action="status"]'
  );
  const button = document.createElement("button");
  button.type = "button";
  button.className = "lpsa-status-button control-icon";
  button.setAttribute("aria-label", "Статусы");
  button.setAttribute("data-tooltip", "Статусы");
  button.innerHTML = '<i class="fas fa-shield-heart" inert></i><span>Статусы</span>';
  const panel = document.createElement("div");
  panel.className = "lpsa-hud-panel";
  panel.hidden = true;
  panel.append(viewElement(actor));
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    const show = panel.hidden;
    panel.hidden = !show;
    hideTooltip();
    if (show) {
      renderView(panel.querySelector(".lpsa-status-view"));
      placePanel(panel, button);
    }
  });
  button.addEventListener("contextmenu", event => event.preventDefault());
  if (original) original.replaceWith(button);
  else (root.querySelector(".col.right, .right") ?? root).append(button);
  root.append(panel);
  // The original palette is never an editor for a player, including alternate HUD bindings.
  root.querySelectorAll(".status-effects").forEach(node => { node.hidden = true; });
}
function installHud() {
  const Parent = CONFIG.Token?.hudClass;
  if (!Parent || Parent._lpsaLocked) return;
  const inherited = Parent.DEFAULT_OPTIONS?.actions?.effect;
  const handler = typeof inherited === "function" ? inherited : inherited?.handler;
  class PlayerStatusHUD extends Parent {
    static _lpsaLocked = true;
    static DEFAULT_OPTIONS = {
      actions: {
        effect: {
          buttons: [0, 2],
          handler(event, target) {
            if (isPlayer()) { event.preventDefault(); event.stopPropagation(); return; }
            return handler?.call(this, event, target);
          }
        }
      }
    };
    _getStatusEffectChoices() {
      const choices = super._getStatusEffectChoices();
      if (!isPlayer()) return choices;
      return Object.fromEntries(Object.entries(choices).filter(([id, status]) =>
        status.isActive || this.actor?.statuses?.has(id)));
    }
    togglePalette(palette, active) {
      if (isPlayer() && /effect|status/i.test(String(palette))) {
        decorateHud(this);
        const button = this.element?.querySelector(".lpsa-status-button");
        if (button && active !== false) button.click();
        else if (active === false) {
          const panel = this.element?.querySelector(".lpsa-hud-panel");
          if (panel) panel.hidden = true;
        }
        return;
      }
      return super.togglePalette(palette, active);
    }
    async _onRender(context, options) {
      await super._onRender(context, options);
      decorateHud(this);
    }
  }
  CONFIG.Token.hudClass = PlayerStatusHUD;
}
function renameNav(root) {
  const nodes = root.querySelectorAll(
    '.tabs [data-tab="effects"],.sheet-tabs [data-tab="effects"],[data-action="tab"][data-tab="effects"]');
  for (const nav of nodes) {
    if (nav.closest(".lpsa-status-view") || nav.matches(".tab")) continue;
    const label = nav.querySelector("span.label,span.title,span:not(.icon)") ?? nav;
    if (label === nav) {
      for (const child of [...nav.childNodes]) if (child.nodeType === 3 && child.textContent.trim()) {
        child.textContent = " Статусы"; break;
      }
      if (!nav.textContent.includes("Статусы")) nav.textContent = "Статусы";
    } else label.textContent = "Статусы";
    nav.setAttribute("aria-label", "Статусы");
  }
}
function decorateSheet(app, element) {
  if (!isPlayer()) return;
  const actor = app.document ?? app.object;
  if (actor?.documentName !== "Actor") return;
  const root = element?.jquery ? element[0] : element ?? app.element;
  if (!root?.querySelector) return;
  renameNav(root);
  const tab = [...root.querySelectorAll('.tab[data-tab="effects"]')].find(e =>
    !e.matches("button,a") && !e.closest(".tabs,.sheet-tabs"));
  if (tab) {
    tab.replaceChildren(viewElement(actor));
    return;
  }
  // Fallback for custom sheets which do not expose the standard effects tab.
  const header = root.querySelector(".window-header");
  if (!header || header.querySelector(".lpsa-sheet-button")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "lpsa-sheet-button";
  button.textContent = "Статусы";
  button.addEventListener("click", () => openWindow(actor));
  header.insertBefore(button, header.querySelector(".window-controls") ?? null);
}
function openWindow(actor) {
  if (!actor) return;
  return foundry.applications.api.DialogV2.wait({
    window: { title: "Статусы — " + actor.name },
    content: '<div class="lpsa-window"></div>',
    buttons: [{ action: "close", label: "Закрыть", default: true }],
    render: app => {
      const container = app.element?.querySelector(".lpsa-window");
      if (!container) return;
      container.replaceChildren(viewElement(actor));
    },
    rejectClose: false
  });
}
function guardEffect(effect) {
  if (!isPlayer()) return;
  // Actor effects are GM-managed; non-actor item effects are not touched.
  if (effect?.parent?.documentName === "Actor") return false;
}
function guardActor(actor, changes) {
  if (!isPlayer()) return;
  if (Object.keys(changes ?? {}).some(k => k === "effects" || k.startsWith("effects."))) return false;
}
function guardToken(token, changes) {
  if (!isPlayer()) return;
  const keys = Object.keys(changes ?? {});
  if (keys.some(k => /^(?:effects|overlayEffect)(?:\.|$)/.test(k) ||
      /^flags\.core\.(?:statusId|overlayEffect)(?:\.|$)/.test(k))) return false;
  if ("overlayEffect" in (changes ?? {}) || "effects" in (changes ?? {})) return false;
  if ("statusId" in (changes?.flags?.core ?? {}) || "overlayEffect" in (changes?.flags?.core ?? {})) return false;
}
Hooks.once("init", () => {
  const module = game.modules.get(ID);
  if (module) module.api = { list: collectStatuses, open: openWindow };
});
Hooks.once("setup", installHud);
Hooks.on("renderTokenHUD", (app, element) => decorateHud(app, element));
Hooks.on("renderActorSheetV2", decorateSheet);
Hooks.on("renderActorSheet", decorateSheet);
Hooks.on("renderApplicationV2", (app, element) => {
  if (app.document?.documentName === "Actor") decorateSheet(app, element);
});
Hooks.on("preCreateActiveEffect", guardEffect);
Hooks.on("preUpdateActiveEffect", guardEffect);
Hooks.on("preDeleteActiveEffect", guardEffect);
Hooks.on("preUpdateActor", guardActor);
Hooks.on("preUpdateToken", guardToken);
for (const name of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
  Hooks.on(name, effect => refreshViews(effect?.parent));
}
Hooks.on("updateActor", actor => refreshViews(actor));
Hooks.on("closeTokenHUD", hideTooltip);
