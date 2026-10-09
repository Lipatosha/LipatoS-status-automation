/* LipatoS — Статусы | Foundry VTT 14 / dnd5e 6.0.6
 * Read-only player status viewer. All GM controls stay native.
 */
const ID = "lipatos-status-automation";
const views = new Set();
const panels = new Set();
const descriptions = new Map();
const tooltip = { element: null, request: 0 };

const STATUS_RULES = Object.freeze({
  "bleeding": { name: "Кровотечение", bullets: ["Маркер кровотечения указывает, что существо теряет кровь. Размер, периодичность урона и условия остановки определяет вызвавший его эффект: сам маркер не задаёт универсальный урон.","Применяйте указанные в способности или ране проверки, лечение и способы остановить кровотечение."] },
  "blinded": { name: "Ослепление", bullets: ["Существо ничего не видит и автоматически проваливает проверки характеристик, требующие зрения.","Броски атаки по ослеплённому существу совершаются с преимуществом, а его собственные броски атаки — с помехой."] },
  "burning": { name: "Горение", bullets: ["Существо или предмет охвачено огнём. Урон, момент его получения и способы потушить пламя задаются источником возгорания.","Не добавляйте урон автоматически только из-за значка: в разных эффектах горение действует по-разному."] },
  "charmed": { name: "Очарование", bullets: ["Существо не может атаковать очаровавшего его и выбирать его целью вредоносных способностей или магических эффектов.","Очаровавший имеет преимущество на проверки характеристик при социальном взаимодействии с этим существом."] },
  "cursed": { name: "Проклятие", bullets: ["Существо находится под действием проклятия. Точные ограничения, штрафы, длительность и способы избавления определяются наложившим проклятие эффектом.","Сам по себе маркер не даёт единого штрафа к броскам."] },
  "dehydration": { name: "Обезвоживание", bullets: ["Недостаток воды может приводить к истощению согласно правилам нехватки воды; тяжесть последствий зависит от условий и времени без питья.","Конкретный уровень истощения и его снятие определяются правилами выживания или источником эффекта."] },
  "deafened": { name: "Глухота", bullets: ["Существо не слышит и автоматически проваливает проверки характеристик, для которых необходим слух."] },
  "diseased": { name: "Болезнь", bullets: ["Существо поражено болезнью. Её признаки, урон, проверки, периодичность и излечение указаны в конкретном заболевании.","Единого штрафа для всех болезней нет."] },
  "exhaustion": { name: "Истощение", bullets: ["По правилам Legacy 2014 уровни истощения накапливаются, а эффекты предыдущих уровней сохраняются: 1 — помеха на проверки характеристик; 2 — скорость уменьшена вдвое; 3 — помеха на броски атаки и спасброски.","4 — максимум хитов уменьшен вдвое; 5 — скорость становится 0; 6 — смерть. Продолжительный отдых при достатке пищи и воды снимает один уровень."] },
  "falling": { name: "Падение", bullets: ["Существо падает до тех пор, пока не приземлится или падение не будет остановлено эффектом.","Обычно при приземлении оно получает 1к6 дробящего урона за каждые 10 футов падения (максимум 20к6) и падает ничком, если не избежало урона."] },
  "frightened": { name: "Испуг", bullets: ["Существо совершает с помехой проверки характеристик и броски атаки, пока источник его страха находится в пределах видимости.","Существо не может добровольно приблизиться к источнику страха."] },
  "grappled": { name: "Захват", bullets: ["Скорость захваченного существа становится равна 0 и не может увеличиваться за счёт бонусов.","Захват прекращается, если захвативший становится недееспособным или эффект перемещает цель за пределы досягаемости захвата."] },
  "incapacitated": { name: "Недееспособность", bullets: ["Существо не может совершать действия и реакции. Само по себе это состояние не означает, что оно теряет сознание или не может двигаться."] },
  "invisible": { name: "Невидимость", bullets: ["Существо невозможно увидеть без магии или особого чувства, но его местоположение иногда выдают звуки и следы.","Противник, который не видит невидимое существо, атакует его с помехой; атаки невидимого существа по не видящему его противнику совершаются с преимуществом."] },
  "malnutrition": { name: "Недоедание", bullets: ["Длительная нехватка пищи может приводить к истощению по правилам голода.","Количество времени без еды, последствия и восстановление зависят от норм питания, телосложения и других источников эффекта."] },
  "paralyzed": { name: "Паралич", bullets: ["Существо недееспособно, не может двигаться и говорить.","Оно автоматически проваливает спасброски Силы и Ловкости; атаки по нему имеют преимущество, а попадания атакующего с расстояния до 5 футов становятся критическими."] },
  "petrified": { name: "Окаменение", bullets: ["Существо и его немагическое снаряжение превращаются в твёрдое неподвижное вещество; оно недееспособно, не может двигаться, говорить и воспринимать окружение.","Атаки по нему имеют преимущество; оно проваливает спасброски Силы и Ловкости, получает сопротивление всему урону и иммунитет к яду и болезням (ранее действовавшие яд и болезнь приостанавливаются). Вес увеличивается в десять раз, старение прекращается."] },
  "poisoned": { name: "Отравление", bullets: ["Существо совершает броски атаки и проверки характеристик с помехой.","Дополнительный урон или повторные спасброски бывают только тогда, когда они прямо указаны у соответствующего яда или эффекта."] },
  "prone": { name: "Распластанность", bullets: ["Существо может перемещаться только ползком, пока не встанет; чтобы встать, обычно нужно потратить половину скорости.","Существо атакует с помехой. Атака по нему имеет преимущество, если атакующий находится в пределах 5 футов; иначе атака совершается с помехой."] },
  "restrained": { name: "Обездвиженность", bullets: ["Скорость существа становится равна 0 и не может увеличиваться за счёт бонусов.","Броски атаки по нему совершаются с преимуществом; его собственные броски атаки и спасброски Ловкости — с помехой."] },
  "silenced": { name: "Безмолвие", bullets: ["Существо не может говорить или производить звуки, если так указано наложившим эффектом.","Заклинание, требующее вербального компонента, невозможно произнести там, где нельзя создать необходимый звук. Прочие свойства определяются источником безмолвия."] },
  "stunned": { name: "Ошеломление", bullets: ["Существо недееспособно, не может двигаться и говорит лишь запинаясь.","Оно автоматически проваливает спасброски Силы и Ловкости, а атаки по нему совершаются с преимуществом."] },
  "suffocation": { name: "Удушение", bullets: ["Существо может задерживать дыхание на 1 + модификатор Телосложения минуту (минимум 30 секунд). Когда воздух заканчивается, оно может прожить ещё число раундов, равное модификатору Телосложения (минимум один раунд).","В начале следующего хода после истечения этого времени его хиты опускаются до 0: оно умирает и не может восстановить хиты или стабилизироваться, пока снова не сможет дышать."] },
  "surprised": { name: "Застигнут врасплох", bullets: ["По правилам Legacy 2014 застигнутое врасплох существо не может двигаться или совершать действия в свой первый ход боя.","Оно не может совершать реакции, пока его первый ход не завершится. Это не отдельный постоянный штраф на всю схватку."] },
  "transformed": { name: "Превращение", bullets: ["Форма существа изменена магией или иной способностью. Новые характеристики, движения, действия, длительность и отмена определяются конкретным эффектом.","Сам значок не задаёт универсальных числовых изменений."] },
  "unconscious": { name: "Без сознания", bullets: ["Существо недееспособно, не может двигаться и говорить, не осознаёт происходящего, роняет удерживаемые предметы и падает ничком.","Оно автоматически проваливает спасброски Силы и Ловкости; атаки по нему имеют преимущество. Попадание в пределах 5 футов становится критическим."] },
  "burrowing": { name: "Под землёй", bullets: ["Существо передвигается под поверхностью, используя скорость рытья. То, через какие материалы оно может прорываться и оставляет ли тоннель, определяется его особенностями.","Маркер сам по себе не даёт скорость рытья."] },
  "concentrating": { name: "Концентрация", bullets: ["Существо поддерживает заклинание или способность, требующую концентрации. Начало концентрации на другом эффекте прекращает предыдущую.","При получении урона требуется спасбросок Телосложения со Сл 10 или половиной полученного урона (что больше). Концентрация также прекращается при недееспособности или смерти."] },
  "coverHalf": { name: "Укрытие наполовину", bullets: ["Цель получает +2 к КД и спасброскам Ловкости против эффектов, исходящих с другой стороны укрытия.","Укрытие должно закрывать не менее половины тела."] },
  "coverThreeQuarters": { name: "Укрытие на три четверти", bullets: ["Цель получает +5 к КД и спасброскам Ловкости против эффектов, исходящих с другой стороны укрытия.","Укрытие закрывает около трёх четвертей тела."] },
  "coverTotal": { name: "Полное укрытие", bullets: ["Цель полностью закрыта препятствием: её нельзя выбрать непосредственной целью атаки или заклинания сквозь это укрытие.","Некоторые области воздействия всё ещё могут задеть её в соответствии с правилами конкретного эффекта."] },
  "dead": { name: "Мёртв", bullets: ["Существо погибло. Обычное лечение хитов не возвращает его к жизни.","Воскрешение возможно только способностью или магией, которая прямо это позволяет."] },
  "dodging": { name: "Уклонение", bullets: ["До начала следующего хода существа атаки по нему совершаются с помехой, если оно видит атакующего; оно также совершает спасброски Ловкости с преимуществом.","Преимущества уклонения прекращаются, если существо становится недееспособным или его скорость падает до 0."] },
  "ethereal": { name: "Эфирность", bullets: ["Существо находится на Эфирном плане. Обычно обитатели Материального плана не могут напрямую взаимодействовать с ним и наоборот.","Исключения зависят от магии и особых способностей, позволяющих видеть или воздействовать между планами."] },
  "flying": { name: "Полёт", bullets: ["Существо находится в воздухе. Возможность летать, скорость и способ поддержания полёта задаются его характеристиками или эффектом.","Если скорость полёта становится равна 0 или существо сбито с ног, оно обычно падает, если не умеет парить либо его не удерживает магия."] },
  "hiding": { name: "Скрытность", bullets: ["Существо пытается скрыть своё местоположение; успешность скрытности определяется проверкой Ловкости (Скрытность) против Восприятия наблюдателей.","Выдающие положение действия или обнаружение могут прекратить скрытность. Сам маркер не делает существо невидимым."] },
  "hovering": { name: "Парение", bullets: ["Существо может удерживаться в воздухе без обычного полёта вперёд.","Парение может предотвращать падение при снижении скорости полёта до 0 или падении ничком; конкретные ограничения задаются эффектом."] },
  "marked": { name: "Метка", bullets: ["Цель помечена существом или способностью. Сам маркер используется для отслеживания выбранной цели.","Преимущества против неё, длительность и условия снятия указаны в способности, которая поставила метку."] },
  "sleeping": { name: "Сон", bullets: ["Спящее существо обычно не воспринимает окружение и находится без сознания, пока не проснётся.","Оно может проснуться от урона либо если другое существо разбудит его действием; магический сон может иметь собственные условия пробуждения."] },
  "stable": { name: "Стабилизирован", bullets: ["Существо с 0 хитами остаётся без сознания, но больше не совершает спасброски от смерти, пока не получит урон.","Если оно не исцелено, по правилам Legacy обычно восстанавливает 1 хит через 1к4 часа."] }
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
  const localized = localize(info.name ?? info.label ?? id);
  // Keep the world's established Russian wording when present; otherwise use
  // our complete Russian status dictionary, even on English system clients.
  return /[А-Яа-яЁё]/.test(localized) ? localized : (STATUS_RULES[id]?.name ?? localized);
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
  let label = "";
  try {
    const parts = effect.getDurationParts?.();
    if (parts?.length) label = parts.filter(Boolean).join(" · ");
  } catch (_) { /* Some effects have no duration formatter */ }
  label = String(label || effect.duration?.label || "").trim();
  // D&D5e can localize "no duration" to "Нет" even for an active condition.
  // This is not a countdown, so omit the subtitle instead of displaying it.
  const none = new Set(["", "нет", "none", "no", "n/a", "—", "-", "отсутствует", "dnd5e.none", "core.none"]);
  return none.has(label.toLocaleLowerCase()) ? "" : label;
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
  // The upstream compendium can point at English 2024 pages even in Legacy 2014.
  // Prefer a complete, edition-correct Russian ruleset for every stock status.
  const rule = STATUS_RULES[entry.statusId];
  if (rule) return "<ul>" + rule.bullets.map(text => "<li>" + esc(text) + "</li>").join("") + "</ul>";
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

  if (entry.description) {
    try {
      const html = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        entry.description, { async: true, secrets: game.user.isGM, documents: true, links: true });
      return normalizeRules(html);
    } catch (_) { /* Keep text fallback */ }
    return "<p>" + esc(entry.description.replace(/<[^>]*>/g, " ")) + "</p>";
  }
  return "<p>Для этого дополнительного состояния источник не указал правила действия. Уточните их в описании способности или у ведущего.</p>";
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
  panel.style.top = Math.max(12, Math.min(rect.top, window.innerHeight -
    Math.min(panel.offsetHeight || 300, window.innerHeight - 24) - 12)) + "px";
}
function isEffectsPalette(palette) {
  return /^(?:effects?|statuses?|statusEffects)$/i.test(String(palette ?? ""));
}
function nativeStatusButton(root) {
  return root?.querySelector?.(
    'button[data-action="togglePalette"][data-palette="effects"],' +
    'button[data-action="togglePalette"][data-palette="statusEffects"],' +
    'button[data-action="togglePalette"][data-palette="statuses"],' +
    'button[data-action="toggleEffects"],button[data-action="toggleStatusEffects"]'
  );
}
function closeStatusPanel(hud, remove = false) {
  const panel = hud?._lpsaPanel;
  if (!panel) return;
  panel.hidden = true;
  hud._lpsaButton?.classList?.remove("active");
  hideTooltip();
  if (remove) {
    panel.remove();
    panels.delete(panel);
    hud._lpsaPanel = null;
    hud._lpsaButton = null;
  }
}
function toggleStatusPanel(hud, anchor = hud?._lpsaButton, active) {
  if (!isPlayer() || !hud || !anchor) return;
  const actor = hud.actor ?? hud.object?.actor;
  if (!actor) return;
  let panel = hud._lpsaPanel;
  if (!panel || !panel.isConnected) {
    panel = document.createElement("div");
    panel.className = "lpsa-hud-panel";
    panel.hidden = true;
    document.body.append(panel);
    hud._lpsaPanel = panel;
    panels.add(panel);
  }
  const show = active === undefined ? panel.hidden : !!active;
  if (!show) { closeStatusPanel(hud); return; }
  const previous = panel.querySelector(".lpsa-status-view");
  if (!previous || previous._lpsaActor?.uuid !== actor.uuid) {
    panel.replaceChildren(viewElement(actor));
  } else renderView(previous);
  panel.hidden = false;
  anchor.classList.add("active");
  placePanel(panel, anchor);
}
function gmStatusEntry(hud, statusId) {
  if (!statusId) return null;
  const actor = hud?.actor ?? hud?.object?.actor;
  const effect = Array.from(actor?.effects ?? []).find(e =>
    effectVisible(e) && Array.from(e.statuses ?? []).includes(statusId));
  const info = conditionConfig(statusId);
  return {
    statusId,
    name: conditionName(statusId),
    img: info.img ?? info.icon ?? effect?.img ?? "",
    effect: effect ?? null,
    description: effect?.description ?? "",
    source: effect?.name ?? ""
  };
}
const NATIVE_TOOLTIP_ATTRIBUTES = ["data-tooltip", "data-tooltip-text", "data-tooltip-html", "title"];
function suppressNativeStatusTooltip(icon) {
  if (!icon) return;
  // Remove only tooltip attributes, never status id, CSS, click actions or native icon.
  const elements = [icon, ...(icon.querySelectorAll?.(
    "[title],[data-tooltip],[data-tooltip-text],[data-tooltip-html]"
  ) ?? [])];
  for (const element of elements) {
    for (const attribute of NATIVE_TOOLTIP_ATTRIBUTES) {
      if (element.hasAttribute?.(attribute)) element.removeAttribute(attribute);
    }
  }
}
function suppressNativePaletteTooltips(root) {
  for (const icon of root?.querySelectorAll?.("[data-status-id]") ?? []) {
    suppressNativeStatusTooltip(icon);
  }
}
function decorateGMHud(hud, supplied) {
  if (!game.user?.isGM) return;
  const root = supplied?.jquery ? supplied[0] : supplied ?? hud.element;
  if (!root?.addEventListener) return;
  suppressNativePaletteTooltips(root);
  if (root._lpsaGMTooltipBound) return;
  // Event delegation also handles icons re-rendered when the native palette is opened.
  // No click/contextmenu handlers or visual changes to the GM status grid.
  root._lpsaGMTooltipBound = true;
  if (typeof MutationObserver !== "undefined") {
    root._lpsaStatusObserver = new MutationObserver(() => suppressNativePaletteTooltips(root));
    root._lpsaStatusObserver.observe(root, { childList: true, subtree: true, attributes: true,
      attributeFilter: NATIVE_TOOLTIP_ATTRIBUTES });
  }
  const statusIcon = target => {
    const icon = target?.closest?.("[data-status-id]");
    return icon?.dataset?.statusId && root.contains(icon) ? icon : null;
  };
  root.addEventListener("mouseover", event => {
    const icon = statusIcon(event.target);
    if (!icon || root._lpsaHoveredStatus === icon) return;
    suppressNativeStatusTooltip(icon);
    game.tooltip?.deactivate?.();
    root._lpsaHoveredStatus = icon;
    const entry = gmStatusEntry(hud, icon.dataset.statusId);
    if (entry) showTooltip(entry, event).catch(error => console.warn(ID, error));
  });
  root.addEventListener("mousemove", event => {
    if (statusIcon(event.target) === root._lpsaHoveredStatus) positionTooltip(event);
  });
  root.addEventListener("mouseout", event => {
    const icon = statusIcon(event.target);
    if (icon !== root._lpsaHoveredStatus ||
        (event.relatedTarget && icon?.contains(event.relatedTarget))) return;
    root._lpsaHoveredStatus = null;
    hideTooltip();
  });
  root.addEventListener("focusin", event => {
    const icon = statusIcon(event.target);
    if (!icon) return;
    root._lpsaHoveredStatus = icon;
    const entry = gmStatusEntry(hud, icon.dataset.statusId);
    if (entry) showTooltip(entry, event).catch(error => console.warn(ID, error));
  });
  root.addEventListener("focusout", event => {
    const icon = statusIcon(event.target);
    if (icon !== root._lpsaHoveredStatus ||
        (event.relatedTarget && icon?.contains(event.relatedTarget))) return;
    root._lpsaHoveredStatus = null;
    hideTooltip();
  });
}
function decorateHud(hud, supplied) {
  if (!isPlayer()) return;
  const root = supplied?.jquery ? supplied[0] : supplied ?? hud.element;
  const actor = hud.actor ?? hud.object?.actor;
  if (!root?.querySelector || !actor) return;
  const button = nativeStatusButton(root);
  if (!button) return;
  // Keep the original Foundry/D&D5e status icon, layout and palette action.
  // Only change its tooltip and redirect a player's clicks to the read-only list.
  button.classList.add("lpsa-status-control");
  button.setAttribute("aria-label", "Статусы");
  button.setAttribute("data-tooltip", "Статусы");
  button.setAttribute("data-tooltip-text", "Статусы");
  button.title = "Статусы";
  for (const node of [...button.childNodes]) {
    if (node.nodeType === 3 && node.textContent.trim()) node.textContent = "";
  }
  button.querySelectorAll("span.label,span.title").forEach(el => { el.hidden = true; });
  hud._lpsaButton = button;
  if (!button._lpsaListener) {
    button.addEventListener("click", event => {
      if (!isPlayer()) return;
      // Capture before the native palette handler so clicking stays usable.
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleStatusPanel(hud, button);
    }, true);
    button.addEventListener("contextmenu", event => {
      if (!isPlayer()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    button._lpsaListener = true;
  }
  // The stock assign-status palette is never exposed to a player.
  root.querySelectorAll('.palette.status-effects,[data-palette="effects"].status-effects')
    .forEach(node => { node.hidden = true; });
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
      if (isPlayer() && isEffectsPalette(palette)) {
        decorateHud(this);
        toggleStatusPanel(this, this._lpsaButton, active);
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
  if (effect?.parent?.documentName !== "Actor") return;

  // D&D5e 6.0.6 автоматически создаёт и снимает псевдостатус falling
  // при движении токена. Он не доступен игроку как обычный ручной выбор
  // в нашей панели, поэтому штатную механику падения не блокируем.
  const statuses = Array.from(effect?.statuses ?? []);
  if (statuses.length === 1 && statuses[0] === "falling") return;

  return false;
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
Hooks.on("renderTokenHUD", (app, element) => {
  if (game.user?.isGM) decorateGMHud(app, element);
  else decorateHud(app, element);
});
Hooks.on("renderActorSheetV2", decorateSheet);
Hooks.on("renderActorSheet", decorateSheet);
Hooks.on("renderApplicationV2", (app, element) => {
  if (app.document?.documentName === "Actor") decorateSheet(app, element);
  if (game.user?.isGM && app === globalThis.canvas?.tokens?.hud) decorateGMHud(app, element);
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
Hooks.on("closeTokenHUD", hud => {
  closeStatusPanel(hud, true);
  const root = hud?.element;
  root?._lpsaStatusObserver?.disconnect();
  if (root) root._lpsaHoveredStatus = null;
  hideTooltip();
});
Hooks.once("ready", () => {
  document.addEventListener("pointerdown", event => {
    for (const panel of panels) {
      if (!panel.isConnected) { panels.delete(panel); continue; }
      if (panel.hidden || panel.contains(event.target)) continue;
      const owner = canvas?.tokens?.hud;
      if (owner?._lpsaPanel === panel) {
        if (!owner._lpsaButton?.contains(event.target)) closeStatusPanel(owner);
      } else {
        panel.hidden = true;
      }
    }
  }, true);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeStatusPanel(canvas?.tokens?.hud);
    }
  });
});
