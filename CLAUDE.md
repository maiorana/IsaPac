# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

IsaPac — clone de Pac-Man de tema pessoal (a "Isadora" foge dos "Ronaldos") em Canvas 2D, JavaScript puro, sem build step e sem dependências.

Arquivos: `index.html`, `style.css`, `game.js` (toda a lógica), e três imagens (`Isadora.jpg`, `Ronaldo.jpg` viram sprites circulares; `PlantaMapa.PNG` é só a referência visual da planta do apartamento que inspirou o mapa).

## Como rodar

Precisa de servidor HTTP local — abrir `index.html` direto via `file://` faz o `loadImage` falhar com CORS (`crossOrigin = 'anonymous'` em `game.js`) e o jogo cai no fallback de retângulos coloridos.

```sh
python3 -m http.server   # depois abrir http://localhost:8000
```

A própria mensagem de erro no overlay diz isso quando o load falha.

Não há build, lint, nem testes — edição direta nos três arquivos.

## Arquitetura de `game.js`

O arquivo tem ~860 linhas dividido em seções comentadas (`// ===== CONFIG`, `// ===== STATE`, etc.). Os pontos não-óbvios:

**Mapa.** Hardcoded como array de strings em `MAP_STR` (`#` parede, `.` pellet, `P` power, `=` porta da casa, `G` spawn de fantasma, espaço = vazio). 19×21 tiles de 24px → canvas 456×504. A linha 9 fica aberta nas laterais e funciona como túnel horizontal (wrap em `moveEntity`).

**Movimento tile-based.** Toda a lógica vive em `moveEntity` (~linha 254): entidades só decidem direção quando passam pelo centro do tile. Player tem `nextDx/nextDy` (queue de input); fantasmas usam o callback `onAtCenter` (`pickGhostDirection`) chamado no centro de cada tile. **Atenção ao bug histórico aqui**: o `if (approachingCenter && distToCenter <= step + 0.01)` precisa do guarda `approachingCenter`, senão o snap dispara também no frame logo após sair do centro (`distToCenter == step`) e teleporta a entidade de volta — sintoma é "personagens andam pela metade da velocidade e travam aleatoriamente em cada cruzamento". Não remova esse check.

**IA dos fantasmas.** Replica o arcade clássico em `setGhostTarget`:
- 0 Vermelho/Blinky: alvo direto = posição do player
- 1 Rosa/Pinky: 4 tiles à frente do player
- 2 Ciano/Inky: vetor (player+2)*2 − Blinky
- 3 Laranja/Clyde: persegue se a distância² > 36, senão vai pro canto inferior-esquerdo

Modos: `chase`, `frightened` (após power-pellet, 6.5s), `eaten` (vai pra casa em velocidade 140), `leave` (sai da casa em ordem escalonada via `exitTimer = idx * 2.5`). Velocidades por modo em `updateGhost` (~linha 531).

**Sprites.** Construídos uma vez em `loadAssets`: `cropCircularFace` faz crop circular dos JPGs; `buildGhostSprite` compõe corpo do fantasma (semicírculo + base ondulada) com o rosto do Ronaldo dentro + halo colorido. O canvas resultante vira sprite reutilizável.

**Otimizações intencionais (preservar ao mexer no render).**
- `getContext('2d', { alpha: false })` para evitar compositing extra
- `mapBgCanvas`: paredes neon (com `shadowBlur`) renderizadas UMA vez em canvas off-screen; `drawMap` faz blit por frame
- Pellets desenhados em `beginPath` único / `fill` único por frame (não 1 fill por pellet)
- Power-pellets simulam glow com 2 fills concêntricos em vez de `shadowBlur` por frame
- `pickGhostDirection` usa buffers reutilizáveis (`_validDx/_validDy/_target`, `DIRS_DX/DIRS_DY`) — evita alocação a cada chamada de IA

**Game state.** Variáveis globais (`map`, `player`, `ghosts`, `state`, `score`, `lives`, `powerTimer`, `ghostStreak`). Estados de `state`: `idle | playing | paused | dead | won`. `startGame` reconstrói tudo do zero; `playerDie` só reseta posições (mantém pellets comidos).

**Loop principal.** `tick(ts)` em `requestAnimationFrame`. `dt` é clampado a 0.05s para evitar pulos grandes (tab inativa). FPS é calculado com `rawDt` sem clamp em janela de 0.5s.

## Convenções

- Código e comentários em PT-BR
- Nada de framework / bundler / TypeScript — manter JavaScript puro com `'use strict'`
- Indentação 4 espaços
- Nada de `console.log` espalhado; o único `console.error` é no catch de `loadAssets`
