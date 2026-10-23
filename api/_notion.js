/* Pont Notion commun aux fonctions. Le jeton reste côté serveur. */
const VERSION = "2022-06-28";
// Identifiants des bases Notion (pas des secrets : sans le jeton, ils ne donnent accès à rien).
const CONFS = process.env.NOTION_DB_CONFERENCES || "aad41919954f464a80fba09025a9c2b6";
const INTERS = process.env.NOTION_DB_INTERVENANTS || "24fa7ccbd70f4e0db797372377f719ca";
const EQUIPE = process.env.NOTION_DB_EQUIPE || "e69787f084cd49d7944b77f3424a6d7e";

async function notion(chemin, methode = "GET", corps) {
  for (let essai = 0; ; essai++) {
    const r = await fetch("https://api.notion.com/v1/" + chemin, {
      method: methode,
      headers: {
        Authorization: "Bearer " + process.env.NOTION_TOKEN,
        "Notion-Version": VERSION,
        "Content-Type": "application/json",
      },
      body: corps ? JSON.stringify(corps) : undefined,
    });
    // Notion limite à ~3 requêtes/s : on attend et on recommence.
    if ((r.status === 429 || r.status >= 500) && essai < 4) {
      await new Promise((ok) => setTimeout(ok, 1000 * (essai + 1)));
      continue;
    }
    const j = await r.json();
    if (!r.ok) throw new Error(`Notion ${r.status} : ${j.message}`);
    return j;
  }
}

async function tout(db, filtre) {
  const lignes = [];
  let curseur;
  do {
    const r = await notion(`databases/${db}/query`, "POST", { filter: filtre, start_cursor: curseur, page_size: 100 });
    lignes.push(...r.results);
    curseur = r.has_more ? r.next_cursor : undefined;
  } while (curseur);
  return lignes;
}

/* Lecture des propriétés Notion en valeurs simples. */
function lire(p) {
  const o = { id: p.id, modifie: p.last_edited_time };
  for (const [nom, v] of Object.entries(p.properties)) {
    if (v.type === "title" || v.type === "rich_text") o[nom] = v[v.type].map((t) => t.plain_text).join("");
    else if (v.type === "checkbox") o[nom] = v.checkbox;
    else if (v.type === "select") o[nom] = v.select ? v.select.name : "";
    else if (v.type === "multi_select") o[nom] = v.multi_select.map((x) => x.name);
    else if (v.type === "date") o[nom] = v.date ? v.date.start : "";
    else if (v.type === "number") o[nom] = v.number;
    else if (v.type === "relation") o[nom] = v.relation.map((x) => x.id);
  }
  return o;
}

/* Écriture : valeurs simples -> propriétés Notion, selon le type déclaré. */
const TYPES = {
  Code: "title", Nom: "title", Salon: "select", Théâtre: "select", "Statut montage": "select",
  Date: "date", "Monté le": "date", Ordre: "number",
  Présent: "checkbox", Modérateur: "checkbox", "Ajouté sur place": "checkbox", "Retiré du programme": "checkbox",
  Conférence: "relation",
};
function ecrire(valeurs) {
  const props = {};
  for (const [nom, v] of Object.entries(valeurs)) {
    const t = TYPES[nom] || "rich_text";
    if (t === "title" || t === "rich_text") props[nom] = { [t]: [{ text: { content: String(v ?? "").slice(0, 2000) } }] };
    else if (t === "select") props[nom] = { select: v ? { name: String(v) } : null };
    else if (t === "date") props[nom] = { date: v ? { start: v } : null };
    else if (t === "number") props[nom] = { number: v ?? null };
    else if (t === "checkbox") props[nom] = { checkbox: !!v };
    else if (t === "relation") props[nom] = { relation: [].concat(v).map((id) => ({ id })) };
  }
  return props;
}

const creer = (db, valeurs) => notion("pages", "POST", { parent: { database_id: db }, properties: ecrire(valeurs) });
const modifier = (id, valeurs) => notion("pages/" + id, "PATCH", { properties: ecrire(valeurs) });
const archiver = (id) => notion("pages/" + id, "PATCH", { archived: true });

/* Code d'accès partagé + prénom inscrit dans la base Équipe.
   Renvoie {prenom, role, salles} ou null (réponse d'erreur déjà envoyée). */
async function autorise(req, res) {
  if (req.headers["x-studios-code"] !== process.env.STUDIOS_CODE) {
    res.status(401).json({ erreur: "Code d'accès incorrect" });
    return null;
  }
  const { cle } = require("../regles");
  const prenom = decodeURIComponent(req.headers["x-studios-prenom"] || "");
  const qui = (await tout(EQUIPE)).map(lire).find((e) => cle(e["Prénom"]) === cle(prenom));
  if (!prenom || !qui) {
    res.status(403).json({ erreur: `Prénom « ${prenom} » inconnu : demande à Yanis de t'ajouter dans l'équipe.` });
    return null;
  }
  return { prenom: qui["Prénom"], role: qui["Rôle"] || "Opérateur", salles: qui.Salles || [] };
}

/* Toute modification sur place d'une conférence déjà montée la renvoie au monteur. */
async function aRefaire(confId) {
  const c = lire(await notion("pages/" + confId));
  if (c["Statut montage"] === "Monté" || c["Statut montage"] === "Livré") await modifier(confId, { "Statut montage": "À refaire" });
}

module.exports = { notion, tout, lire, creer, modifier, archiver, autorise, aRefaire, CONFS, INTERS, EQUIPE };
