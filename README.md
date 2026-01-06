# Chrome Extension Self Scraper

Extension Chrome avec Sidepanel pour extraire des données structurées depuis n'importe quelle page web.

## 🚀 Installation

```bash
# Installer les dépendances
npm install

# Build l'extension
npm run build
```

Ensuite :
1. Ouvrir `chrome://extensions/`
2. Activer le "Mode développeur"
3. Cliquer sur "Charger l'extension non empaquetée"
4. Sélectionner le dossier `dist/`

## 📖 Utilisation

1. Cliquer sur l'icône de l'extension pour ouvrir le Sidepanel
2. Cliquer sur "New Column" pour activer le mode sélection
3. Survoler un élément sur la page → Il sera surligné en bleu
4. Cliquer sur l'élément → Une colonne est créée avec tous les éléments similaires
5. Répéter pour créer plusieurs colonnes
6. Cliquer sur "Export JSON" pour télécharger les données

## 🛠️ Technologies

- **Vite** - Build tool
- **React** + **TypeScript** - UI framework
- **Tailwind CSS v4** - Styling
- **CRXJS** - Chrome Extension plugin for Vite
- **Lucide React** - Icons

## 📁 Structure

```
src/
├── manifest.json          # Configuration de l'extension
├── types.ts               # Types TypeScript partagés
├── sidepanel/             # Interface utilisateur
│   ├── index.html
│   ├── index.tsx
│   └── App.tsx
├── content/               # Scripts injectés dans les pages
│   ├── index.ts
│   └── selectorUtils.ts
├── background/            # Service worker
│   └── index.ts
└── index.css              # Styles globaux
```

## 🎯 Fonctionnalités

- ✅ Sélection visuelle d'éléments avec highlight
- ✅ Détection automatique d'éléments similaires
- ✅ Gestion de plusieurs colonnes
- ✅ Export JSON
- ✅ Design épuré et moderne

## 📝 License

MIT
