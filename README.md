# Studio S — montage automatique des conférences de salon

Page de référence complète dans Notion : Pryzma › Studio S.

## Ce qu'il y a ici

| Où | Quoi | Tourne où |
| --- | --- | --- |
| `index.html` | App des opérateurs et des monteurs : présents/absents, ajouts, remarques à timecode, statut de montage | Vercel (téléphone, PC) |
| `import.html` | Import de l'Excel du salon, relançable sans rien casser ; « Vider ce salon » pour effacer l'essai | Vercel |
| `api/` | Fonctions Vercel qui parlent à Notion (le jeton ne quitte jamais le serveur) | Vercel |
| `regles.js` | Règles de lecture de l'Excel et de raccourcissement des titres/fonctions | navigateur + serveur |
| `outils/` | Générateur des PNG (titre, synthés) : `Generer_les_textes.bat` | PC du monteur, **pas** Vercel |

Pas de build, pas de framework, aucune dépendance npm.

## Variables d'environnement Vercel

Obligatoires : `NOTION_TOKEN` et `STUDIOS_CODE`. Les trois identifiants de bases ont une valeur par défaut dans `api/_notion.js` ; les variables ne servent qu'à les remplacer.

- `NOTION_TOKEN` : jeton de l'intégration Notion (intégration dédiée « Studio S », connectée à la page Studio S)
- `NOTION_DB_CONFERENCES` : `aad41919954f464a80fba09025a9c2b6`
- `NOTION_DB_INTERVENANTS` : `24fa7ccbd70f4e0db797372377f719ca`
- `NOTION_DB_EQUIPE` : `e69787f084cd49d7944b77f3424a6d7e`
- `STUDIOS_CODE` : code d'accès partagé donné aux opérateurs

## Qui voit quoi

Base Notion « Équipe » : un prénom, un rôle, des salles. Un opérateur ne voit que ses salles ; un monteur voit tout et peut importer. Un prénom absent de la base est refusé. Se remplit dans Notion, sans redéployer.

Redéployer après tout changement de variable. L'intégration Notion doit être connectée à la page Studio S (••• › Connexions).

## Ce que l'import ne touche jamais

Présent, Ajouté sur place, Notes opérateur, Statut montage, Monté par/le, et « Titre à l'écran » quand il a été corrigé à la main. Ce qui disparaît de l'Excel est marqué « Retiré du programme », jamais supprimé.

## Vérifications

`outils/importer.py` (Python) et `regles.js` (JS) appliquent les mêmes règles : comparer leurs sorties après toute modification d'une règle.
