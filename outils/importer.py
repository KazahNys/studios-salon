"""Excel du salon -> conferences.json (une entrée par CODE, intervenants nettoyés).

Règles de raccourcissement (validées avec Yanis, à ajuster) :
  1. « COMPLETE NAME » = « Prénom NOM, Fonction, Entreprise » découpé aux virgules.
  2. Plus de 3 morceaux -> fonction = 1er titre seulement, entreprise = dernier morceau, ligne signalée.
  3. Parenthèses retirées de la fonction : « EVP (Executive Vice President) Innovation » -> « EVP Innovation ».
  4. Une seule entreprise : on coupe à « / » ou « + » et on garde la première.
  5. Fonction > 45 caractères -> signalée (le rendu réduit la taille, mais un humain tranche).
  6. Doublons (même code + même nom) supprimés, lignes sans nom ignorées et signalées.
Usage : python3 importer.py salon.xlsx conferences.json
"""
import json, re, sys
import openpyxl

FONCTION_MAX = 45


def nettoyer(texte):
    return re.sub(r"\s+", " ", str(texte or "")).strip().rstrip(".").strip()


# Ce qui n'est pas le sujet de la conférence sort du carton (le titre Excel reste dans Notion).
RETRAITS_TITRE = [
    r"^Interview exclusive de .+? par [^-:]+?\s*[-:]\s*(?=\S)",   # « Interview exclusive de X par Y - »
    r"^En avant-première\s*:\s*",
    r"\s*Une table ronde.*$",                                     # « … ? Une Table Ronde en partenariat avec … »
    r"\s*,?\s*en partenariat avec.*$",
    r"\s+en avant-première\s*$",
]


def titre_ecran(titre):
    """Titre affiché à l'écran + vrai s'il a été raccourci (à relire)."""
    t = re.sub(r"[’']{2,}", "’", titre)
    for motif in RETRAITS_TITRE:
        t = re.sub(motif, "", t, flags=re.I).strip()
    return t, t != titre


def decouper(complet):
    morceaux = [nettoyer(m) for m in str(complet).split(",") if nettoyer(m)]
    alertes = []
    if len(morceaux) > 2 and re.fullmatch(r"[A-ZÀ-Ý' -]{2,}", morceaux[1]):
        morceaux = [morceaux[0] + " " + morceaux[1]] + morceaux[2:]  # « Prénom, NOM, … »
    if len(morceaux) < 3:
        alertes.append("format inattendu")
        morceaux += [""] * (3 - len(morceaux))
    if len(morceaux) > 3:
        alertes.append("plus de 3 morceaux : vérifier fonction / entreprise")
    nom, fonction, entreprise = morceaux[0], morceaux[1], morceaux[-1]
    fonction = nettoyer(re.sub(r"\([^)]*\)", "", fonction))
    if " / " in fonction:  # « Consultante / Formatrice … » : on n'en garde qu'une
        fonction = fonction.split(" / ")[0]
        alertes.append("fonction coupée")
    entreprise = nettoyer(re.split(r"\s[/+]\s|/", entreprise)[0])
    if len(fonction) > FONCTION_MAX:
        alertes.append("fonction longue")
    if not re.search(r"[A-ZÀ-Ý]{2,}", nom):
        alertes.append("nom sans NOM en majuscules")
    return {"nom": nom, "fonction": fonction, "entreprise": entreprise, "alertes": alertes}


def importer(chemin):
    """Lit chaque onglet par le nom de ses colonnes (elles varient d'un onglet à l'autre)."""
    confs, precedent = {}, None
    for feuille in openpyxl.load_workbook(chemin, data_only=True):
        lignes = feuille.iter_rows(values_only=True)
        tete = [nettoyer(t).upper() for t in next(lignes)]
        col = lambda l, nom: next((l[i] for i, t in enumerate(tete) if t == nom and i < len(l) and l[i] not in (None, "")), None)
        for l in lignes:
            titre = col(l, "TITLE")
            if not titre:
                continue
            code = col(l, "CODE") or (precedent if precedent and confs[precedent]["titre"] == nettoyer(titre) else None)
            if not code:
                continue
            precedent = code
            date, debut, fin = col(l, "DATE"), col(l, "START_TIME"), col(l, "END_TIME")
            c = confs.setdefault(code, {
                "code": code, "date": date.strftime("%Y-%m-%d") if date else "",
                "debut": debut.strftime("%H:%M") if debut else "", "fin": fin.strftime("%H:%M") if fin else "",
                "theatre": nettoyer(col(l, "THEATRE__NAME")), "titre": nettoyer(titre),
                "titre_ecran": titre_ecran(nettoyer(titre))[0],
                "sponsor": nettoyer(col(l, "SPONSORED")), "operateur": nettoyer(col(l, "OPERATEUR")),
                "notes": [], "intervenants": [],
                "alertes": ([] if re.fullmatch(r"[A-Z]\d{5}", code) else ["code mal formé"])
                           + (["titre raccourci"] if titre_ecran(nettoyer(titre))[1] else [])})
            for i, t in enumerate(tete):
                if t == "NOTES" and i < len(l) and nettoyer(l[i]):
                    c["notes"].append(str(l[i]).strip())
            if col(l, "COMPLETE NAME"):
                i = decouper(col(l, "COMPLETE NAME"))
            elif col(l, "NAME"):
                i = {"nom": nettoyer(f"{col(l, 'NAME')} {col(l, 'SURNAME') or ''}"), "fonction": "", "entreprise": "",
                     "alertes": ["pas de fonction ni d'entreprise dans l'Excel"]}
            else:
                continue
            i["chair"] = i["nom"].lower().startswith("chair ")
            i["nom"] = re.sub(r"^chair\s+", "", i["nom"], flags=re.I)
            if not any(x["nom"] == i["nom"] for x in c["intervenants"]):
                c["intervenants"].append(i)
    return sorted(confs.values(), key=lambda c: c["code"])


if __name__ == "__main__":
    # Auto-vérification minimale des règles.
    assert decouper("Philippe GIL, Directeur Associé et Co-fondateur, ILDI")["entreprise"] == "ILDI"
    assert decouper("Anne BRUMEAUX, EVP (Executive Vice President) Innovation & Solutions., CXG")["fonction"] == "EVP Innovation & Solutions"
    assert decouper("Achim LELLE, AI Strategist & Transformation Advisor, Lakeside Analytics LTD, London")["alertes"]
    assert decouper("David, Kelly, Learning & Technology Analyst, Keynote Speaker, Industry Researcher")["alertes"]
    assert decouper("Chair Anne-Marie, CUINIER, Consultante, Learn & Enjoy")["nom"] == "Chair Anne-Marie CUINIER"
    assert titre_ecran("Interview exclusive de Matthieu Langlois par Frédéric Ferrer - Du RAID à l’entreprise")[0] == "Du RAID à l’entreprise"
    assert titre_ecran("Comment faire ? Une Table Ronde en partenariat avec le club")[0] == "Comment faire ?"
    assert titre_ecran("En avant-première : Passez à la vitesse IA")[0] == "Passez à la vitesse IA"
    assert decouper("A B, Consultante / Formatrice, X")["fonction"] == "Consultante"
    confs = importer(sys.argv[1])
    json.dump(confs, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
    # Même données en .js : la page de rendu les lit en file:// sans serveur.
    open(sys.argv[2].rsplit(".", 1)[0] + ".js", "w").write("CONFS = " + json.dumps(confs, ensure_ascii=False) + ";")
    signal = [(c["code"], i["nom"], i["alertes"]) for c in confs for i in c["intervenants"] if i["alertes"]]
    print(len(confs), "conférences,", sum(len(c["intervenants"]) for c in confs), "intervenants,", len(signal), "à vérifier")
    for s in signal:
        print(" ", *s)
