/* Import de l'Excel, relançable sans rien casser. Appelé par import.html, une conférence à la fois.
   POST {action: "conference", salon, conf}  -> crée ou met à jour la conférence et ses intervenants
   POST {action: "terminer", salon, codes}   -> marque « Retiré du programme » ce qui n'est plus dans l'Excel
   POST {action: "vider", salon}             -> archive les fiches du salon (10 conférences par appel, à répéter jusqu’à « fini »)

   Ce que l'import réécrit : les champs venus de l'Excel.
   Ce qu'il ne touche jamais : Présent, Ajouté sur place, Notes opérateur, Statut montage, Monté par/le,
   et « Titre à l'écran » s'il a été corrigé à la main. */
const { notion, tout, lire, creer, modifier, archiver, autorise, CONFS, INTERS } = require("./_notion");
const { titreEcran, cle } = require("../regles");

const duSalon = (salon) => ({ property: "Salon", select: { equals: salon } });

async function importerConference(salon, c) {
  const excel = {
    Salon: salon, Date: c.date || null, Début: c.debut, Fin: c.fin, Théâtre: c.theatre, Titre: c.titre,
    Sponsor: c.sponsor, Opérateur: c.operateur, "À vérifier": c.alertes.join(" · "), "Retiré du programme": false,
  };
  const [existante] = await tout(CONFS, { and: [duSalon(salon), { property: "Code", title: { equals: c.code } }] });
  let confId;
  if (existante) {
    const avant = lire(existante);
    confId = avant.id;
    // Titre à l'écran : mis à jour seulement s'il n'a pas été retouché à la main.
    const retouche = avant["Titre à l'écran"] && avant["Titre à l'écran"] !== titreEcran(avant.Titre);
    await modifier(confId, retouche ? excel : { ...excel, "Titre à l'écran": c.titre_ecran });
  } else {
    confId = (await creer(CONFS, {
      Code: c.code, ...excel, "Titre à l'écran": c.titre_ecran, "Statut montage": "À monter", "Notes opérateur": c.notes.join("\n"),
    })).id;
  }

  const deja = (await tout(INTERS, { property: "Conférence", relation: { contains: confId } })).map(lire);
  const vus = new Set();
  for (const [n, i] of c.intervenants.entries()) {
    const valeurs = {
      Nom: i.nom, Code: c.code, Fonction: i.fonction, Entreprise: i.entreprise, Modérateur: i.chair,
      Ordre: n + 1, "À vérifier": i.alertes.join(" · "), "Retiré du programme": false,
    };
    const trouve = deja.find((d) => cle(d.Nom) === cle(i.nom));
    if (trouve) { vus.add(trouve.id); await modifier(trouve.id, valeurs); }
    else await creer(INTERS, { ...valeurs, Conférence: confId, Présent: true });
  }
  // Plus dans l'Excel (et pas ajouté sur place) : retiré, pas supprimé.
  for (const d of deja) {
    if (!vus.has(d.id) && !d["Ajouté sur place"] && !d["Retiré du programme"]) await modifier(d.id, { "Retiré du programme": true });
  }
  return { code: c.code, nouvelle: !existante };
}

module.exports = async (req, res) => {
  const moi = await autorise(req, res);
  if (!moi) return;
  if (moi.role !== "Monteur") return res.status(403).json({ erreur: "Import réservé aux monteurs" });
  const { action, salon } = req.body || {};
  if (req.method !== "POST" || !salon) return res.status(400).json({ erreur: "salon manquant" });
  try {
    if (action === "conference") return res.json(await importerConference(salon, req.body.conf));

    if (action === "terminer") {
      const codes = new Set(req.body.codes);
      const retirees = [];
      for (const c of (await tout(CONFS, duSalon(salon))).map(lire)) {
        if (!codes.has(c.Code) && !c["Retiré du programme"]) { await modifier(c.id, { "Retiré du programme": true }); retirees.push(c.Code); }
      }
      return res.json({ retirees });
    }

    if (action === "vider") {
      const confs = (await notion(`databases/${CONFS}/query`, "POST", { filter: duSalon(salon), page_size: 10 })).results;
      for (const c of confs) {
        for (const i of await tout(INTERS, { property: "Conférence", relation: { contains: c.id } })) await archiver(i.id);
        await archiver(c.id);
      }
      return res.json({ archivees: confs.length, fini: confs.length === 0 });
    }
    res.status(400).json({ erreur: "action inconnue" });
  } catch (e) {
    res.status(500).json({ erreur: e.message });
  }
};
