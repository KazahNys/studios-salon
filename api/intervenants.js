/* POST  /api/intervenants {confId, code, Nom, Fonction, Entreprise} -> ajouté sur place
   PATCH /api/intervenants {id, confId, Présent | Nom | Fonction | Entreprise} */
const { creer, modifier, autorise, aRefaire, INTERS } = require("./_notion");

const MODIFIABLES = ["Présent", "Nom", "Fonction", "Entreprise"];

module.exports = async (req, res) => {
  try {
    if (!(await autorise(req, res))) return;
    const { id, confId, code, ...valeurs } = req.body || {};
    const refuses = Object.keys(valeurs).filter((k) => !MODIFIABLES.includes(k));
    if (!confId || refuses.length) return res.status(400).json({ erreur: "Requête incomplète ou champ non modifiable" });
    if (req.method === "POST") {
      if (!valeurs.Nom) return res.status(400).json({ erreur: "Nom obligatoire" });
      const p = await creer(INTERS, { ...valeurs, "Code conf": code, Conférence: confId, Présent: true, "Ajouté sur place": true, Ordre: 50 });
      await aRefaire(confId);
      return res.json({ ok: true, id: p.id });
    }
    if (req.method === "PATCH" && id) {
      await modifier(id, valeurs);
      await aRefaire(confId);
      return res.json({ ok: true });
    }
    res.status(405).end();
  } catch (e) {
    res.status(500).json({ erreur: e.message });
  }
};
