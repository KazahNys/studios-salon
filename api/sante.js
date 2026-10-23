/* GET /api/sante : l'app est-elle bien branchée ? (aucun secret renvoyé, juste oui/non et des nombres) */
const { tout, CONFS, INTERS, EQUIPE } = require("./_notion");

module.exports = async (req, res) => {
  const r = { jeton: !!process.env.NOTION_TOKEN, code: !!process.env.STUDIOS_CODE };
  for (const [nom, db] of [["equipe", EQUIPE], ["conferences", CONFS], ["intervenants", INTERS]]) {
    try { r[nom] = (await tout(db)).length; } catch (e) { r[nom] = "erreur : " + e.message; }
  }
  res.json(r);
};
