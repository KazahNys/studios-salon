/* Règles de lecture de l'Excel du salon (mêmes règles que outils/importer.py).
   Utilisé par import.html (navigateur) et api/import.js (serveur).
   Lignes = tableaux de cellules par onglet (XLSX.utils.sheet_to_json(ws, { header: 1 })). */
(function (exporter) {
  const FONCTION_MAX = 45;
  const nettoyer = (t) => String(t ?? "").replace(/\s+/g, " ").trim().replace(/\.$/, "").trim();

  // Ce qui n'est pas le sujet de la conférence sort du carton.
  const RETRAITS_TITRE = [
    /^Interview exclusive de .+? par [^-:]+?\s*[-:]\s*(?=\S)/i, // « Interview exclusive de X par Y - »
    /^En avant-première\s*:\s*/i,
    /\s*Une table ronde.*$/i, // « … ? Une Table Ronde en partenariat avec … »
    /\s*,?\s*en partenariat avec.*$/i,
    /\s+en avant-première\s*$/i,
  ];
  function titreEcran(titre) {
    let t = String(titre).replace(/[’']{2,}/g, "’");
    for (const m of RETRAITS_TITRE) t = t.replace(m, "").trim();
    return t;
  }

  function decouper(complet) {
    let m = String(complet).split(",").map(nettoyer).filter(Boolean);
    const alertes = [];
    if (m.length > 2 && /^[A-ZÀ-Ý' -]{2,}$/.test(m[1])) m = [m[0] + " " + m[1], ...m.slice(2)]; // « Prénom, NOM, … »
    if (m.length < 3) { alertes.push("format inattendu"); while (m.length < 3) m.push(""); }
    if (m.length > 3) alertes.push("plus de 3 morceaux : vérifier fonction / entreprise");
    const nom = m[0];
    let fonction = nettoyer(m[1].replace(/\([^)]*\)/g, ""));
    if (fonction.includes(" / ")) { fonction = fonction.split(" / ")[0]; alertes.push("fonction coupée"); }
    const entreprise = nettoyer(m[m.length - 1].split(/\s[/+]\s|\//)[0]);
    if (fonction.length > FONCTION_MAX) alertes.push("fonction longue");
    if (!/[A-ZÀ-Ý]{2,}/.test(nom)) alertes.push("nom sans NOM en majuscules");
    return { nom, fonction, entreprise, alertes };
  }

  const heure = (v) => (v instanceof Date ? String(v.getHours()).padStart(2, "0") + ":" + String(v.getMinutes()).padStart(2, "0") : nettoyer(v).slice(0, 5));
  const jour = (v) => (v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}` : nettoyer(v));

  /* onglets : [[ligne d'en-tête, ...lignes], ...] -> conférences */
  function lireExcel(onglets) {
    const confs = {};
    let precedent = null;
    for (const lignes of onglets) {
      if (!lignes.length) continue;
      const tete = lignes[0].map((t) => nettoyer(t).toUpperCase());
      const col = (l, nom) => {
        for (let i = 0; i < tete.length; i++) if (tete[i] === nom && l[i] !== undefined && l[i] !== null && l[i] !== "") return l[i];
        return null;
      };
      for (const l of lignes.slice(1)) {
        const titre = col(l, "TITLE");
        if (!titre) continue;
        let code = col(l, "CODE");
        code = code ? nettoyer(code) : precedent && confs[precedent].titre === nettoyer(titre) ? precedent : null;
        if (!code) continue;
        precedent = code;
        const c = (confs[code] ||= {
          code, date: jour(col(l, "DATE")), debut: heure(col(l, "START_TIME")), fin: heure(col(l, "END_TIME")),
          theatre: nettoyer(col(l, "THEATRE__NAME")), titre: nettoyer(titre), titre_ecran: titreEcran(nettoyer(titre)),
          sponsor: nettoyer(col(l, "SPONSORED")), operateur: nettoyer(col(l, "OPERATEUR")),
          notes: [], intervenants: [],
          alertes: [...(/^[A-Z]\d{5}$/.test(code) ? [] : ["code mal formé"]), ...(titreEcran(nettoyer(titre)) !== nettoyer(titre) ? ["titre raccourci"] : [])],
        });
        tete.forEach((t, i) => { if (t === "NOTES" && nettoyer(l[i])) c.notes.push(String(l[i]).trim()); });
        let i;
        if (col(l, "COMPLETE NAME")) i = decouper(col(l, "COMPLETE NAME"));
        else if (col(l, "NAME")) i = { nom: nettoyer(`${col(l, "NAME")} ${col(l, "SURNAME") || ""}`), fonction: "", entreprise: "", alertes: ["pas de fonction ni d'entreprise dans l'Excel"] };
        else continue;
        i.chair = /^chair /i.test(i.nom);
        i.nom = i.nom.replace(/^chair\s+/i, "");
        if (!c.intervenants.some((x) => x.nom === i.nom)) c.intervenants.push(i);
      }
    }
    return Object.values(confs).sort((a, b) => a.code.localeCompare(b.code));
  }

  /* Deux écritures d'un même nom (accents, casse) = la même personne. */
  const cle = (nom) => String(nom).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

  exporter({ lireExcel, titreEcran, decouper, cle });
})((api) => {
  if (typeof module !== "undefined") module.exports = api;
  else window.Regles = api;
});
