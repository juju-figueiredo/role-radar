"use strict";
const byId = id => document.getElementById(id);
const normalize = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const storageKey = "role-radar-tracker-v1";
let tracker = {};
try { tracker = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch {}
let feed = {jobs: [], sources: {}};
let currentView = "Discover";
let sector = "All";
let pageSize = 24;
let offline = false;

function assess(job) {
  const title = normalize(job.title);
  const location = normalize(job.location);
  const senior = /\b(head|director|vp|vice president|general manager|country manager|lead|principal|senior manager|gerente s[eê]nior|diretor[a]?)\b/.test(title);
  const regional = /\b(latam|latin america|america latina|brazil|brasil)\b/.test(title);
  const partnerships = /partnership|business development|desenvolvimento de neg|ecosystem|go.to.market|\bgtm\b|market (expansion|development)|country manager/.test(title);
  const capital = /investor relation|fundrais|origination|originacao|private credit|venture (debt|banking)|capital formation|capital markets|growth lending|structured (credit|finance)/.test(title);
  const preferred = /miami|south florida|fort lauderdale|san francisco|bay area|san mateo|san jose|palo alto|mountain view|sunnyvale|redwood city|menlo park|oakland|brazil|brasil|sao paulo|rio de janeiro|belo horizonte/.test(location);
  const remote = /\b(remote|remoto)\b/.test(location);
  const remoteMarket = !/\b(emea|apac|eu|europe|canada|uk|india|australia|germany|france|poland|japan|singapore|china)\b/.test(location) ||
    /\b(us|usa|united states|brazil|brasil|latam|worldwide|global)\b/.test(location);
  const unrelated = /revenue accounting|technical accounting|finance business partner|sales development representative|partner engineer/.test(title);
  const score = 12 + 21*senior + 26*regional + 24*partnerships + 24*capital + 17*preferred + 10*(remote && remoteMarket && !preferred) + 9*(job.sector === "AI") - 22*(remote && !remoteMarket && !preferred) - 26*/\b(intern|associate|analyst|coordinator|assistant|engineer|accountant|finance business partner)\b/.test(title) - 55*unrelated - 18*Boolean(job.stale);
  const reasons = [];
  if (regional) reasons.push("LATAM mandate");
  if (partnerships) reasons.push("Partnerships or GTM");
  if (capital) reasons.push("Capital or investor coverage");
  if (senior) reasons.push("Senior scope");
  if (preferred) reasons.push("Preferred market");
  if (remote) reasons.push("Check remote eligibility");
  if (job.stale) reasons.push("Source refresh pending");
  return {...job, score, reasons};
}

function render() {
  const list = byId("cards");
  const query = normalize(byId("search").value.trim());
  const active = new Map(feed.jobs.map(job => [job.id, job]));
  const jobs = currentView === "Discover" ? feed.jobs :
    Object.values(tracker).filter(entry => entry.status === currentView).map(entry =>
      active.get(entry.job.id) || {...entry.job, stale: true, unconfirmed: true});
  const matches = jobs.map(assess).filter(job => currentView !== "Discover" ||
    (job.score >= 39 && tracker[job.id]?.status !== "Applied" && (sector === "All" || sector === job.sector) &&
      normalize([job.title,job.company,job.location].join(" ")).includes(query)))
    .sort((a,b) => b.score-a.score || (b.firstSeen || "").localeCompare(a.firstSeen || "") || a.title.localeCompare(b.title));
  byId("page-title").textContent = currentView;
  byId("browse").hidden = currentView !== "Discover";
  byId("sources").hidden = currentView !== "Discover";
  byId("count").textContent = matches.length ? `${matches.length} ${matches.length === 1 ? "role" : "roles"}` : "";
  list.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = currentView === "Discover" ?
      (feed.updatedAt ? "No matching roles. Try a different search or industry." : "The job feed is waiting for its first successful refresh.") :
      `No ${currentView.toLowerCase()} roles yet.`;
    list.append(empty);
  }
  for (const job of matches.slice(0,pageSize)) {
    const card = byId("job-card").content.cloneNode(true);
    card.querySelector(".company").textContent = `${job.company} · ${job.sector}`;
    card.querySelector(".match").textContent = job.unconfirmed ? "Listing unconfirmed" : job.stale ? "Check availability" : job.score >= 70 ? "Strong match" : "Worth a look";
    card.querySelector("h3").textContent = job.title;
    card.querySelector(".location").textContent = job.location;
    card.querySelector(".reason").textContent = job.reasons.join(" · ");
    const link = card.querySelector("a");
    try {
      const url = new URL(job.url);
      if (url.protocol === "https:") link.href = url.href;
    } catch {}
    const status = tracker[job.id]?.status;
    for (const [selector, state, label, selected] of [
      [".save","Saved","Save","Remove saved"],
      [".apply","Applied","Mark applied","Undo applied"]
    ]) {
      const button = card.querySelector(selector);
      button.dataset.job = job.id;
      button.dataset.state = state;
      button.textContent = status === state ? selected : label;
      button.onclick = () => {
        if (status === state) delete tracker[job.id];
        else tracker[job.id] = {job: active.get(job.id) || job, status: state};
        try { localStorage.setItem(storageKey, JSON.stringify(tracker)); }
        catch { byId("freshness").textContent = "Device storage is unavailable. Tracking changes last for this session."; }
        render();
        Array.from(list.querySelectorAll(selector)).find(item => item.dataset.job === job.id)?.focus();
      };
    }
    list.append(card);
  }
  byId("more").hidden = matches.length <= pageSize;
}

async function refresh() {
  byId("refresh").disabled = true;
  try {
    const response = await fetch("./data/jobs.json", {cache:"no-store"});
    if (!response.ok) throw Error("Feed unavailable");
    const data = await response.json();
    if (!Array.isArray(data.jobs) || !data.sources) throw Error("Invalid feed");
    feed = data;
    offline = response.headers.get("X-Role-Radar-Offline") === "1";
    const sources = Object.values(feed.sources);
    const available = sources.filter(source => source.ok).length;
    byId("freshness").textContent = feed.updatedAt ?
      `${offline ? "Offline copy · " : ""}Checked ${new Date(feed.updatedAt).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"})} · ${available}/${sources.length} sources` :
      "Awaiting first refresh";
    byId("source-list").replaceChildren(...sources.map(source => {
      const row = document.createElement("li");
      row.textContent = `${source.company} · ${source.ok ? "Updated" : "Unavailable"}`;
      return row;
    }));
  } catch {
    byId("freshness").textContent = feed.updatedAt ? "Refresh unavailable. Showing the previous feed." : "The feed could not be loaded.";
  } finally {
    render();
    byId("refresh").disabled = false;
  }
}
document.querySelectorAll("[data-view]").forEach(button => button.onclick = () => {
  document.querySelector("[aria-current=page]").removeAttribute("aria-current");
  button.setAttribute("aria-current","page");
  currentView = button.dataset.view;
  pageSize = 24;
  render();
  window.scrollTo(0,0);
});
document.querySelectorAll("[data-sector]").forEach(button => button.onclick = () => {
  document.querySelector("[data-sector][aria-pressed=true]").setAttribute("aria-pressed","false");
  button.setAttribute("aria-pressed","true");
  sector = button.dataset.sector;
  pageSize = 24;
  render();
});
byId("search").oninput = () => {pageSize = 24; render();};
byId("more").onclick = () => {pageSize += 24; render();};
byId("refresh").onclick = refresh;
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(console.warn);
refresh();
