/* GET   /api/conferences            -> {moi, conferences} : celles des salles du prénom (toutes pour un monteur)
   GET   /api/conferences?salon=X    -> celles d'un salon
   PATCH /api/conferences {id, ...}  -> champs modifiables ci-dessous seulement */
const { tout, lire, modifier, autorise, aRefaire, CONFS, INTERS } = require("./_notion");

const MODIFIABLES = ["Notes opérateur", "Titre à l'écran", "Statut montage", "Monté par", "Monté le"];
const SUR_PLACE = ["Notes opérateur", "Titre à l'écran"]; // ceux-là renvoient une conf montée « À refaire »

module.exports = async (req, res) => {
  try {
    const moi = await autorise(req, res);
    if (!moi) return;
    if (req.method === "GET") {
      const filtre = { property: "Retiré du programme", checkbox: { equals: false } };
      const parSalon = req.query.salon ? { and: [filtre, { property: "Salon", select: { equals: req.query.salon } }] } : filtre;
      const [confs, inters] = await Promise.all([tout(CONFS, parSalon), tout(INTERS, filtre)]);
      const parCode = {};
      for (const i of inters.map(lire)) (parCode[i.Code] ||= []).push(i);
      // ponytail: filtre de lecture seulement ; un opérateur pourrait écrire hors de ses salles via l'API, à ajouter si besoin.
      const visibles = confs.map(lire).filter((c) => moi.role === "Monteur" || moi.salles.includes(c["Théâtre"]));
      const liste = visibles.map((c) => ({
        ...c,
        intervenants: (parCode[c.Code] || []).sort((a, b) => (a.Ordre ?? 99) - (b.Ordre ?? 99)),
      }));
      liste.sort((a, b) => (a.Date + a.Début + a.Code).localeCompare(b.Date + b.Début + b.Code));
      return res.json({ moi, conferences: liste });
    }
    if (req.method === "PATCH") {
      const { id, ...valeurs } = req.body || {};
      const refuses = Object.keys(valeurs).filter((k) => !MODIFIABLES.includes(k));
      if (!id || refuses.length) return res.status(400).json({ erreur: "Champ non modifiable : " + refuses.join(", ") });
      await modifier(id, valeurs);
      if (Object.keys(valeurs).some((k) => SUR_PLACE.includes(k))) await aRefaire(id);
      return res.json({ ok: true });
    }
    res.status(405).end();
  } catch (e) {
    res.status(500).json({ erreur: e.message });
  }
};
