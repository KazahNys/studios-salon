// Accès : prénom inconnu refusé, opérateur limité à ses salles, monteur voit tout, opérateur ne peut pas importer.
const assert = require("assert");
const page = (id, db, props) => ({ id, last_edited_time: "", properties: props });
const t = (v) => ({ type: "title", title: [{ plain_text: v }] }), r = (v) => ({ type: "rich_text", rich_text: [{ plain_text: v }] });
const sel = (v) => ({ type: "select", select: v ? { name: v } : null }), ms = (l) => ({ type: "multi_select", multi_select: l.map((name) => ({ name })) });
const cb = (v) => ({ type: "checkbox", checkbox: v });
const DB = {
  E: [page("e1", "E", { "Prénom": t("Anaël"), "Rôle": sel("Opérateur"), Salles: ms(["Salle de conférences Paris"]) }),
      page("e2", "E", { "Prénom": t("Yanis"), "Rôle": sel("Monteur"), Salles: ms([]) })],
  C: [page("c1", "C", { Code: t("P11000"), "Théâtre": sel("Salle de conférences Paris"), "Retiré du programme": cb(false), Date: { type: "date", date: null }, "Début": r("10:00") }),
      page("c2", "C", { Code: t("B11400"), "Théâtre": sel("Salle de conférences Berlin"), "Retiré du programme": cb(false), Date: { type: "date", date: null }, "Début": r("14:00") })],
  I: [],
};
global.fetch = async (url) => ({ ok: true, status: 200, json: async () => ({ results: DB[url.split("/databases/")[1].split("/")[0]], has_more: false }) });
Object.assign(process.env, { NOTION_DB_CONFERENCES: "C", NOTION_DB_INTERVENANTS: "I", NOTION_DB_EQUIPE: "E", STUDIOS_CODE: "x" });
const appel = (h, prenom, methode = "GET", body = {}) => new Promise((ok) => {
  const res = { code: 200, status(c) { this.code = c; return this; }, json(j) { ok({ code: this.code, j }); }, end() { ok({ code: this.code }); } };
  require(h)({ method: methode, query: {}, body, headers: { "x-studios-code": "x", "x-studios-prenom": encodeURIComponent(prenom) } }, res);
});
const C = __dirname + "/../api/conferences.js", I = __dirname + "/../api/import.js";
(async () => {
  assert.equal((await appel(C, "Inconnu")).code, 403);
  const op = await appel(C, "anael");  // sans accent ni majuscule : reconnu
  assert.deepEqual(op.j.conferences.map((c) => c.Code), ["P11000"]);
  assert.equal(op.j.moi.prenom, "Anaël");
  assert.equal((await appel(C, "Yanis")).j.conferences.length, 2);
  assert.equal((await appel(I, "Anaël", "POST", { action: "vider", salon: "x" })).code, 403);
  console.log("OK : accès par prénom vérifié");
})().catch((e) => { console.error("ÉCHEC", e); process.exit(1); });
