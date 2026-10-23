// Faux Notion en mémoire : vérifie que le réimport ne casse rien de ce qui est saisi sur place.
const assert = require("assert");
const pages = {}; let n = 0;
const val = (p) => { // propriétés Notion -> valeur brute pour filtrer
  const o = {}; for (const [k, v] of Object.entries(p)) o[k] = v.title ? v.title[0].text.content : v.rich_text ? v.rich_text[0].text.content
    : v.select !== undefined ? v.select && v.select.name : v.checkbox !== undefined ? v.checkbox : v.relation ? v.relation.map((r) => r.id) : v.date !== undefined ? v.date && v.date.start : v.number; return o; };
const vers = (p) => { const props = {}; for (const [k, v] of Object.entries(p.props)) props[k] = { ...v, type: Object.keys(v)[0] === "text" ? "rich_text" : Object.keys(v)[0] };
  for (const k in props) { const t = props[k].type; if (t === "title" || t === "rich_text") props[k][t] = props[k][t].map((x) => ({ plain_text: x.text.content })); if (t === "relation") props[k].relation = props[k].relation; }
  return { id: p.id, last_edited_time: "", properties: props }; };
const filtre = (f, v) => !f ? true : f.and ? f.and.every((x) => filtre(x, v)) : f.title ? v[f.property] === f.title.equals
  : f.select ? v[f.property] === f.select.equals : f.checkbox ? !!v[f.property] === f.checkbox.equals : f.relation ? (v[f.property] || []).includes(f.relation.contains) : true;
// Schéma réel des bases (comme dans Notion) : un champ envoyé avec le mauvais type est refusé.
const SCHEMA = {
  C: { Code: "title", Salon: "select", Date: "date", "Début": "rich_text", Fin: "rich_text", "Théâtre": "select", Titre: "rich_text", "Titre à l'écran": "rich_text",
       Sponsor: "rich_text", "Opérateur": "rich_text", "Notes opérateur": "rich_text", "Statut montage": "select", "Monté par": "rich_text", "Monté le": "date", "À vérifier": "rich_text", "Retiré du programme": "checkbox" },
  I: { Nom: "title", "Code conf": "rich_text", "Conférence": "relation", Fonction: "rich_text", Entreprise: "rich_text", "Présent": "checkbox", "Modérateur": "checkbox",
       "Ajouté sur place": "checkbox", Ordre: "number", "À vérifier": "rich_text", "Retiré du programme": "checkbox" },
};
function verifier(db, props) {
  for (const [k, v] of Object.entries(props || {})) {
    const attendu = SCHEMA[db] && SCHEMA[db][k];
    if (SCHEMA[db] && (!attendu || !(attendu in v))) throw new Error(`validation_error: ${k} attendu ${attendu} dans ${db}`);
  }
}
global.fetch = async (url, o) => {
  const corps = o.body ? JSON.parse(o.body) : {}; const chemin = url.split("/v1/")[1];
  let r;
  if (chemin === "pages" && o.method === "POST") verifier(corps.parent.database_id, corps.properties);
  if (chemin.startsWith("pages/") && o.method === "PATCH" && corps.properties) verifier(pages[chemin.slice(6)].db, corps.properties);
  if (chemin === "pages" && o.method === "POST") { const id = "p" + ++n; pages[id] = { id, db: corps.parent.database_id, props: corps.properties }; r = vers(pages[id]); }
  else if (chemin.startsWith("pages/") && o.method === "PATCH") { const p = pages[chemin.slice(6)]; if (corps.archived) p.archived = true; Object.assign(p.props, corps.properties || {}); r = vers(p); }
  else if (chemin.startsWith("pages/")) r = vers(pages[chemin.slice(6)]);
  else { const db = chemin.split("/")[1]; r = { results: Object.values(pages).filter((p) => p.db === db && !p.archived && filtre(corps.filter, val(p.props))).map(vers), has_more: false }; }
  return { ok: true, status: 200, json: async () => r };
};
Object.assign(process.env, { NOTION_DB_CONFERENCES: "C", NOTION_DB_INTERVENANTS: "I", STUDIOS_CODE: "x", NOTION_DB_EQUIPE: "E" });
pages.e1 = { id: "e1", db: "E", props: { "Prénom": { title: [{ text: { content: "Yanis" } }] }, "Rôle": { select: { name: "Monteur" } } } };
const handler = require(__dirname + "/../api/import.js");
const call = (body) => new Promise((ok) => handler({ method: "POST", headers: { "x-studios-code": "x", "x-studios-prenom": "yanis" }, body }, { status() { return this; }, json: ok }));
const R = require(__dirname + "/../regles.js");
const conf = (inters, titre = "Interview exclusive de A par B - Le sujet") => ({ code: "B11400", date: "2026-11-18", debut: "14:00", fin: "14:25", theatre: "Berlin", titre, titre_ecran: R.titreEcran(titre), sponsor: "", operateur: "", notes: [], alertes: [],
  intervenants: inters.map((nom) => ({ nom, fonction: "F", entreprise: "E", chair: false, alertes: [] })) });
const lesInters = () => Object.values(pages).filter((p) => p.db === "I").map((p) => ({ id: p.id, ...val(p.props) }));
const laConf = () => Object.values(pages).filter((p) => p.db === "C").map((p) => ({ id: p.id, ...val(p.props) }));
(async () => {
  const S = "Essai";
  assert.equal((await call({ action: "conference", salon: S, conf: conf(["Michèle VELVES", "Paul DUPONT"]) })).nouvelle, true);
  assert.equal(laConf()[0]["Titre à l'écran"], "Le sujet");
  // Sur place : Paul absent, ajout de Zoé, titre retouché, remarques, monté.
  const paul = lesInters().find((i) => i.Nom === "Paul DUPONT");
  pages[paul.id].props["Présent"] = { checkbox: false };
  const c = laConf()[0];
  Object.assign(pages[c.id].props, { "Titre à l'écran": { rich_text: [{ text: { content: "Mon titre" } }] }, "Notes opérateur": { rich_text: [{ text: { content: "15:00 son" } }] } });
  const z = "p" + ++n; pages[z] = { id: z, db: "I", props: { Nom: { title: [{ text: { content: "Zoé MARTIN" } }] }, Conférence: { relation: [{ id: c.id }] }, "Ajouté sur place": { checkbox: true }, Présent: { checkbox: true } } };
  // Réimport : nouvel Excel où Paul a disparu, Michèle écrite sans accent, nouvel intervenant.
  assert.equal((await call({ action: "conference", salon: S, conf: conf(["Michele VELVES", "Nina ROSS"], "Interview exclusive de A par B - Le sujet v2") })).nouvelle, false);
  const apres = lesInters(), cf = laConf();
  assert.equal(cf.length, 1, "pas de doublon de conférence");
  assert.equal(cf[0]["Titre à l'écran"], "Mon titre", "titre retouché gardé");
  assert.equal(cf[0]["Notes opérateur"], "15:00 son", "remarques gardées");
  assert.equal(cf[0].Titre, "Interview exclusive de A par B - Le sujet v2", "titre Excel mis à jour");
  assert.equal(apres.filter((i) => R.cle(i.Nom) === R.cle("Michèle VELVES")).length, 1, "Michèle pas en double");
  assert.equal(apres.find((i) => i.Nom === "Paul DUPONT")["Retiré du programme"], true, "Paul retiré");
  assert.equal(apres.find((i) => i.Nom === "Paul DUPONT")["Présent"], false, "présence non touchée");
  assert.equal(!!apres.find((i) => i.Nom === "Zoé MARTIN")["Retiré du programme"], false, "ajout sur place gardé");
  assert.ok(apres.find((i) => i.Nom === "Nina ROSS"), "nouvel intervenant créé");
  // Titre non retouché : suit l'Excel.
  pages[c.id].props["Titre à l'écran"] = { rich_text: [{ text: { content: "Le sujet v2" } }] };
  await call({ action: "conference", salon: S, conf: conf(["Nina ROSS"], "Interview exclusive de A par B - Le sujet v3") });
  assert.equal(laConf()[0]["Titre à l'écran"], "Le sujet v3", "titre auto suit l'Excel");
  // Conférence absente du nouvel Excel -> retirée ; un autre salon n'est pas touché.
  await call({ action: "conference", salon: "Autre", conf: conf(["X Y"]) });
  assert.deepEqual((await call({ action: "terminer", salon: S, codes: [] })).retirees, ["B11400"]);
  assert.equal(laConf().find((x) => x.Salon === "Autre")["Retiré du programme"], false);
  // Vider l'essai : archive la conf et ses intervenants, pas l'autre salon.
  for (;;) if ((await call({ action: "vider", salon: S })).fini) break;
  assert.equal(Object.values(pages).filter((p) => !p.archived && p.db === "C").length, 1);
  console.log("OK : réimport, retraits, ajouts sur place, titres retouchés et vidage vérifiés");
})().catch((e) => { console.error("ÉCHEC", e.message); process.exit(1); });
