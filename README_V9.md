# Swing Consensus PRO V9 — site Web

## Installation GitHub Pages

Décompresser le ZIP et déposer `index.html`, `dashboard.html`, `dashboard.js`, `style.css` et `_headers` à la racine du dépôt GitHub Pages. Dans Settings > Pages, sélectionner Deploy from a branch et la branche principale / root. Attendre le déploiement puis actualiser avec Ctrl+Shift+R.

## Proxy Cloudflare

Le champ Connexion aux données utilise par défaut `https://red-limit-73.f5pnfmb6gd.workers.dev`. Déployer le code `cloudflare-worker.js` dans le Worker `red-limit-73` ou conserver un Worker V2 compatible. Actions/FNB : Yahoo Finance; BTC-USD et ETH-USD : Kraken. Le code ne contourne pas les limites HTTP 429 de Yahoo.

## Analyse V9

Ajouts : consensus 4H/Daily/Weekly, structure par cassure des 20 bougies précédentes, divergences RSI régulières et cachées confirmées par pivots 3/3, volume relatif, ATR, plan LONG/SHORT 2R, confirmations, backtest exploratoire Daily. Tous les résultats sont heuristiques, non des probabilités de réussite. Le backtest est simplifié et ne représente pas un résultat négociable.

## Limites

Kraken limite l'historique OHLC à environ 720 bougies; Yahoo peut répondre 429. Le proxy met en cache les données lorsqu'elles ont été récupérées avec succès. La dernière bougie doit être clôturée; le graphique TradingView reste indépendant des calculs.
