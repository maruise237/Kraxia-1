Les règles de correspondance du front-end se trouvent dans `FileDownloadPlugin.tsx`, avec la logique suivante :

## Règles de reconnaissance des chemins de fichiers

La fonction `isFilePath()` (lignes 45-56) décide si un lien s'affiche comme fichier téléchargeable :

Chemins du workspace OpenClaw (via `filemanager/download`) :
- regex : `OPENCLAW_PATH_RE` (lignes 37-38)
- correspond à : `workspace/file.pdf`, `~/.openclaw/workspace/report.docx`, `media/images/pic.png`

Chemins absolus (via `filemanager/serve`) :
- regex : `ABSOLUTE_PATH_RE` (lignes 41-42) : `~?(?:\/[\w._-]+)+\/[\w.\-\u4e00-\u9fff]+\.\w{1,10}`
- et l'extension doit figurer dans l'ensemble `FILE_EXTENSIONS` (lignes 25-32)

## Pourquoi certains fichiers s'affichent et d'autres non ?

Condition pour être reconnu comme lien téléchargeable :
- l'extension doit figurer dans la liste blanche `FILE_EXTENSIONS`

Liste blanche actuelle des extensions :

1. Documents : pdf, doc, docx, xls, xlsx, csv, ppt, pptx, txt, md, json, xml, yaml, yml, toml
2. Images : png, jpg, jpeg, gif, svg, webp, bmp
3. Archives : zip, tar, gz, rar, 7z
4. Médias : mp3, wav, mp4, avi, mov
5. Code : py, js, ts, html, css

# Backend

Les différents répertoires de téléchargement sont téléchargeables.
Voir `platform/app/runtime_backends/hermes_files.py`.
