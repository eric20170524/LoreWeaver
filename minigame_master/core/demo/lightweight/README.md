# Lightweight multi-card demo

Shared host for production certification of simple Gameplay Cards.

```bash
npx vite --config minigame_master/core/demo/lightweight/vite.config.mjs --host 127.0.0.1 --port 5195

# ?card=reaction_pick|energy_balance|observe_capture|drag_to_core|pressure_survival
# &theme=default|neon

npm run check:light-e2e -- --card reaction_pick
npm run check:light-batch
```
