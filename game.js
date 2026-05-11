'use strict';

// ============================================================
// CONFIG
// ============================================================
const TILE = 24;
const COLS = 19;
const ROWS = 21;

const T = { WALL: 1, PELLET: 0, POWER: 2, EMPTY: 3, DOOR: 4, GHOST: 5 };

// Mapa inspirado na planta do apartamento (estilo arcade)
//   # = parede        . = pellet       P = power-pellet
//   ' '(espaço)= vazio   = = porta da casa   G = spawn fantasma
const MAP_STR = [
    '###################', // 0
    '#........#........#', // 1
    '#.##.###.#.###.##.#', // 2
    '#P...............P#', // 3
    '#.##.#.#####.#.##.#', // 4
    '#....#...#...#....#', // 5
    '####.### # ###.####', // 6
    '   #.#       #.#   ', // 7
    '####.# ##=## #.####', // 8
    '    .  #GGG#  .    ', // 9  <- túnel
    '####.# ##### #.####', // 10
    '   #.#       #.#   ', // 11
    '####.### # ###.####', // 12
    '#........#........#', // 13
    '#.##.###.#.###.##.#', // 14
    '#P.#.....#.....#.P#', // 15
    '##.#.#.#####.#.#.##', // 16
    '#....#.......#....#', // 17
    '#.##.###.#.###.##.#', // 18
    '#.................#', // 19
    '###################', // 20
];

const GHOST_COLORS = ['#ff2a2a', '#ffb8ff', '#36e3ff', '#ffa14d'];
const GHOST_NAMES  = ['Vermelho', 'Rosa', 'Ciano', 'Laranja'];

// ============================================================
// STATE
// ============================================================
const canvas = document.getElementById('game');
// alpha:false evita compositing extra. imageSmoothingEnabled false = nearest-neighbor,
// muito mais rápido pra blits de sprite que não precisam de qualidade fotográfica.
const ctx = canvas.getContext('2d', { alpha: false });
const LOGICAL_W = canvas.width;
const LOGICAL_H = canvas.height;
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayMsg = document.getElementById('overlayMsg');
const startBtn = document.getElementById('startBtn');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const fpsEl = document.getElementById('fps');

let map = [];
let pelletsLeft = 0;
let score = 0;
let lives = 3;
let player;
let ghosts = [];
let state = 'idle';        // idle | playing | dead | won
let powerTimer = 0;
let ghostStreak = 0;
let frame = 0;
let lastTs = 0;
let fpsAcc = 0;
let fpsCount = 0;
let fpsTimer = 0;

const sprites = { isadora: null, ronaldo: null, ghosts: [] };
let mapBgCanvas = null; // pre-rendered walls (static)

// ============================================================
// ASSET LOADING & SPRITE PREP
// ============================================================
function loadImage(src) {
    return new Promise((res, rej) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = src;
    });
}

// Recorta um círculo do rosto da imagem original.
// cxRatio/cyRatio = centro relativo da imagem onde está o rosto.
// sizeRatio = quão grande recortar (em fração da menor dimensão).
function cropCircularFace(img, cxRatio, cyRatio, sizeRatio, outSize) {
    const w = img.naturalWidth, h = img.naturalHeight;
    const minDim = Math.min(w, h);
    const cropSize = minDim * sizeRatio;
    const sx = Math.max(0, Math.min(w - cropSize, w * cxRatio - cropSize / 2));
    const sy = Math.max(0, Math.min(h - cropSize, h * cyRatio - cropSize / 2));
    const out = document.createElement('canvas');
    out.width = outSize;
    out.height = outSize;
    const c = out.getContext('2d');
    c.save();
    c.beginPath();
    c.arc(outSize / 2, outSize / 2, outSize / 2, 0, Math.PI * 2);
    c.closePath();
    c.clip();
    c.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, outSize, outSize);
    c.restore();
    return out;
}

// Compõe sprite de fantasma: corpo colorido + rosto do Ronaldo grandão + halo
function buildGhostSprite(faceCanvas, color) {
    const S = 64;
    const out = document.createElement('canvas');
    out.width = S;
    out.height = S;
    const c = out.getContext('2d');

    // Corpo do fantasma — semicirculo em cima, base ondulada
    c.fillStyle = color;
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2 - 2, Math.PI, 0);
    c.lineTo(S - 2, S - 5);
    const w = (S - 4) / 3;
    for (let i = 0; i < 3; i++) {
        const xR = S - 2 - w * i;
        c.lineTo(xR - w / 2, S - 2);
        c.lineTo(xR - w, S - 5);
    }
    c.closePath();
    c.fill();

    // Rosto do Ronaldo bem grande dentro do corpo
    c.save();
    c.beginPath();
    c.arc(S / 2, S / 2 - 3, S / 2 - 5, 0, Math.PI * 2);
    c.clip();
    c.drawImage(faceCanvas, 5, 2, S - 10, S - 10);
    c.restore();

    // Halo colorido em volta do rosto
    c.strokeStyle = color;
    c.lineWidth = 3;
    c.beginPath();
    c.arc(S / 2, S / 2 - 3, S / 2 - 5, 0, Math.PI * 2);
    c.stroke();

    return out;
}

function buildFrightenedSprite() {
    const S = 64;
    const out = document.createElement('canvas');
    out.width = S;
    out.height = S;
    const c = out.getContext('2d');
    c.fillStyle = '#1a1aff';
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2 - 2, Math.PI, 0);
    c.lineTo(S - 2, S - 5);
    const w = (S - 4) / 3;
    for (let i = 0; i < 3; i++) {
        const xR = S - 2 - w * i;
        c.lineTo(xR - w / 2, S - 2);
        c.lineTo(xR - w, S - 5);
    }
    c.closePath();
    c.fill();
    // Olhos e boca assustada
    c.fillStyle = '#fff';
    c.fillRect(20, 26, 8, 8);
    c.fillRect(36, 26, 8, 8);
    c.strokeStyle = '#fff';
    c.lineWidth = 3;
    c.beginPath();
    for (let i = 0; i < 4; i++) {
        c.moveTo(16 + i * 8, 48);
        c.lineTo(20 + i * 8, 42);
        c.lineTo(24 + i * 8, 48);
    }
    c.stroke();
    return out;
}

async function loadAssets() {
    const [iso, ron] = await Promise.all([
        loadImage('Isadora.jpg'),
        loadImage('Ronaldo.jpg'),
    ]);
    // Fotos já são close-up; só centra o crop no rosto
    sprites.isadora = cropCircularFace(iso, 0.50, 0.55, 0.90, 96);
    sprites.ronaldo = cropCircularFace(ron, 0.50, 0.50, 0.85, 96);
    sprites.ghosts = GHOST_COLORS.map(c => buildGhostSprite(sprites.ronaldo, c));
    sprites.frightened = buildFrightenedSprite();
}

// ============================================================
// MAP
// ============================================================
function buildMap() {
    map = [];
    pelletsLeft = 0;
    for (let r = 0; r < ROWS; r++) {
        const row = [];
        for (let c = 0; c < COLS; c++) {
            const ch = MAP_STR[r][c];
            let t;
            switch (ch) {
                case '#': t = T.WALL; break;
                case '.': t = T.PELLET; pelletsLeft++; break;
                case 'P': t = T.POWER;  pelletsLeft++; break;
                case '=': t = T.DOOR; break;
                case 'G': t = T.GHOST; break;
                default:  t = T.EMPTY;
            }
            row.push(t);
        }
        map.push(row);
    }
}

function tileAt(col, row) {
    if (row < 0 || row >= ROWS) return T.WALL;
    if (col < 0 || col >= COLS) return T.EMPTY; // tunnel
    return map[row][col];
}

function isWalkable(col, row, allowDoor = false) {
    const t = tileAt(col, row);
    if (t === T.WALL) return false;
    if (t === T.DOOR && !allowDoor) return false;
    return true;
}

// ============================================================
// ENTITIES
// ============================================================
function newEntity(col, row) {
    return {
        col, row,
        x: col * TILE + TILE / 2,
        y: row * TILE + TILE / 2,
        dx: 0, dy: 0,
        nextDx: 0, nextDy: 0,
        speed: 80, // pixels per second
    };
}

function entityCol(e) { return Math.round((e.x - TILE / 2) / TILE); }
function entityRow(e) { return Math.round((e.y - TILE / 2) / TILE); }

function moveEntity(e, dt, allowDoor = false, onAtCenter = null) {
    const step = Math.min(e.speed * dt, TILE / 2 - 0.5);
    const tx = e.col * TILE + TILE / 2;
    const ty = e.row * TILE + TILE / 2;
    const distToCenter = Math.abs(e.x - tx) + Math.abs(e.y - ty);
    // Sem este check, o snap dispara no frame seguinte ao centro (dist==step) e
    // teleporta a entidade de volta — efeito: velocidade pela metade e travadas
    // em cada cruzamento. Só queremos colar no centro se estamos chegando nele.
    const approachingCenter =
        e.dx !== 0 ? (tx - e.x) * e.dx > 0 :
        e.dy !== 0 ? (ty - e.y) * e.dy > 0 :
        true; // parado: trata como "no centro"

    if (approachingCenter && distToCenter <= step + 0.01) {
        // Snap to center & decide direction
        e.x = tx; e.y = ty;
        if (onAtCenter) onAtCenter(e);

        // Apply queued direction if valid
        if ((e.nextDx !== 0 || e.nextDy !== 0) &&
            isWalkable(e.col + e.nextDx, e.row + e.nextDy, allowDoor)) {
            e.dx = e.nextDx;
            e.dy = e.nextDy;
            e.nextDx = 0;
            e.nextDy = 0;
        }
        // Block if can't continue current direction
        if (!isWalkable(e.col + e.dx, e.row + e.dy, allowDoor)) {
            e.dx = 0; e.dy = 0;
        }

        // Use remaining step
        const remaining = step - distToCenter;
        e.x += e.dx * remaining;
        e.y += e.dy * remaining;
    } else {
        e.x += e.dx * step;
        e.y += e.dy * step;
    }

    // Túnel horizontal (linha 9 fica aberta nas laterais)
    if (e.x < -TILE / 2) e.x = COLS * TILE + TILE / 2 - 1;
    else if (e.x > COLS * TILE + TILE / 2) e.x = -TILE / 2 + 1;

    e.col = entityCol(e);
    e.row = entityRow(e);
    if (e.col < 0) e.col = 0;
    if (e.col >= COLS) e.col = COLS - 1;
}

// ============================================================
// PLAYER
// ============================================================
function makePlayer() {
    const p = newEntity(9, 17);
    p.speed = 90;
    p.facing = 'right';
    p.mouthAngle = 0;
    p.mouthDir = 1;
    return p;
}

function updatePlayer(dt) {
    moveEntity(player, dt);

    // Atualiza facing
    if (player.dx > 0) player.facing = 'right';
    else if (player.dx < 0) player.facing = 'left';
    else if (player.dy > 0) player.facing = 'down';
    else if (player.dy < 0) player.facing = 'up';

    // Animação da boca (menor para deixar o rosto mais visível)
    const moving = player.dx !== 0 || player.dy !== 0;
    if (moving) {
        player.mouthAngle += player.mouthDir * 5 * dt;
        if (player.mouthAngle > 0.45) { player.mouthAngle = 0.45; player.mouthDir = -1; }
        else if (player.mouthAngle < 0) { player.mouthAngle = 0; player.mouthDir = 1; }
    } else {
        player.mouthAngle = 0.25;
    }

    // Comer pellet/power
    const t = tileAt(player.col, player.row);
    if (t === T.PELLET) {
        map[player.row][player.col] = T.EMPTY;
        score += 10;
        pelletsLeft--;
        updateHUD();
    } else if (t === T.POWER) {
        map[player.row][player.col] = T.EMPTY;
        score += 50;
        pelletsLeft--;
        powerTimer = 6.5;
        ghostStreak = 0;
        for (let i = 0; i < ghosts.length; i++) frightenGhost(ghosts[i]);
        updateHUD();
    }

    if (pelletsLeft <= 0) win();
}

function drawPlayer() {
    const size = TILE + 8; // transborda 4px de cada lado para destacar o rosto
    ctx.save();
    ctx.translate(player.x, player.y);

    let mouthAngle = 0;
    switch (player.facing) {
        case 'right': mouthAngle = 0; break;
        case 'down':  mouthAngle = Math.PI / 2; break;
        case 'left':  mouthAngle = Math.PI; break;
        case 'up':    mouthAngle = -Math.PI / 2; break;
    }

    // Imagem da Isadora — sempre de pé
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    ctx.clip();
    if (sprites.isadora) {
        ctx.drawImage(sprites.isadora, -size / 2, -size / 2, size, size);
    } else {
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(-size / 2, -size / 2, size, size);
    }
    ctx.restore();

    // Borda amarela em volta
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    ctx.stroke();

    // Cunha de "boca pacman" preta — gira conforme direção de movimento
    if (player.mouthAngle > 0.05) {
        ctx.rotate(mouthAngle);
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, size / 2 + 1, -player.mouthAngle, player.mouthAngle);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
}

// ============================================================
// GHOSTS
// ============================================================
function makeGhost(idx) {
    // Vermelho começa fora da casa, os outros 3 dentro saindo escalonados
    const cols = [9, 8, 9, 10];
    const rows = [7, 9, 9, 9];
    const g = newEntity(cols[idx], rows[idx]);
    g.idx = idx;
    g.speed = 70;
    g.dy = idx === 0 ? 0 : -1;
    g.dx = idx === 0 ? -1 : 0;
    g.mode = idx === 0 ? 'chase' : 'leave';
    g.spawnCol = cols[idx];
    g.spawnRow = rows[idx];
    g.exitTimer = idx * 2.5; // 0s, 2.5s, 5s, 7.5s
    g.frightTimer = 0;
    return g;
}

function frightenGhost(g) {
    if (g.mode === 'eaten' || g.mode === 'leave') return;
    g.mode = 'frightened';
    // Reverter direção
    g.dx = -g.dx;
    g.dy = -g.dy;
    g.frightTimer = 6.5;
}

// Preenche `out` (objeto reutilizável) em vez de alocar
function setGhostTarget(g, out) {
    if (g.mode === 'eaten') { out.col = 9; out.row = 9; return; }
    if (g.mode === 'leave') {
        if (g.row >= 8) { out.col = 9; out.row = 7; return; }
        g.mode = 'chase';
    }
    switch (g.idx) {
        case 0:
            out.col = player.col; out.row = player.row; return;
        case 1:
            out.col = player.col + player.dx * 4;
            out.row = player.row + player.dy * 4; return;
        case 2: {
            const ax = player.col + player.dx * 2;
            const ay = player.row + player.dy * 2;
            const blinky = ghosts[0];
            out.col = ax + (ax - blinky.col);
            out.row = ay + (ay - blinky.row);
            return;
        }
        case 3: {
            const dc = player.col - g.col, dr = player.row - g.row;
            if (dc * dc + dr * dr > 36) {
                out.col = player.col; out.row = player.row;
            } else {
                out.col = 1; out.row = ROWS - 2;
            }
            return;
        }
    }
    out.col = 1; out.row = 1;
}

// Direções constantes — evita alocação a cada chamada
const DIRS_DX = [0, -1, 0, 1];
const DIRS_DY = [-1, 0, 1, 0];
// Buffer reutilizável para direções válidas
const _validDx = new Int8Array(4);
const _validDy = new Int8Array(4);
const _target = { col: 0, row: 0 };

function pickGhostDirection(g) {
    const allowDoor = g.mode === 'leave' || g.mode === 'eaten';
    const moving = g.dx !== 0 || g.dy !== 0;
    let validCount = 0;

    for (let i = 0; i < 4; i++) {
        const dx = DIRS_DX[i], dy = DIRS_DY[i];
        // Rejeita oposta da direção atual
        if (moving && dx === -g.dx && dy === -g.dy) continue;
        if (!isWalkable(g.col + dx, g.row + dy, allowDoor)) continue;
        _validDx[validCount] = dx;
        _validDy[validCount] = dy;
        validCount++;
    }

    if (validCount === 0) {
        g.dx = -g.dx; g.dy = -g.dy;
        return;
    }

    if (g.mode === 'frightened') {
        const pick = (Math.random() * validCount) | 0;
        g.dx = _validDx[pick];
        g.dy = _validDy[pick];
        return;
    }

    setGhostTarget(g, _target);
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < validCount; i++) {
        const nc = g.col + _validDx[i];
        const nr = g.row + _validDy[i];
        const dc = _target.col - nc;
        const dr = _target.row - nr;
        const dist = dc * dc + dr * dr;
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }
    g.dx = _validDx[bestIdx];
    g.dy = _validDy[bestIdx];
}

function updateGhost(g, dt) {
    // Tickers de tempo (sempre)
    if (g.mode === 'frightened') {
        g.frightTimer -= dt;
        if (g.frightTimer <= 0) g.mode = 'chase';
    }

    // Eaten chegou em casa?
    if (g.mode === 'eaten' && g.col === 9 && g.row === 9) {
        g.mode = 'leave';
        g.exitTimer = 0.5;
    }

    // Modo leave: aguardar timer e sair
    if (g.mode === 'leave') {
        g.exitTimer -= dt;
        if (g.exitTimer > 0) {
            g.dx = 0; g.dy = 0;
            return;
        }
    }

    // Velocidade por modo
    g.speed = g.mode === 'frightened' ? 50 : g.mode === 'eaten' ? 140 : 70;

    // Decidir nova direção quando passa pelo centro (sem closure)
    moveEntity(g, dt,
        g.mode === 'leave' || g.mode === 'eaten',
        pickGhostDirection
    );
}

function drawGhost(g) {
    const size = TILE + 8; // transborda 4px para o rosto ficar maior
    ctx.save();
    ctx.translate(g.x, g.y);

    let sprite;
    if (g.mode === 'eaten') {
        // Apenas olhos
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(-6, -2, 4, 0, Math.PI * 2);
        ctx.arc(6, -2, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0a0aff';
        ctx.beginPath();
        ctx.arc(-6 + g.dx * 1.8, -2 + g.dy * 1.8, 2, 0, Math.PI * 2);
        ctx.arc(6 + g.dx * 1.8, -2 + g.dy * 1.8, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
    } else if (g.mode === 'frightened') {
        // pisca branco perto do fim
        if (g.frightTimer < 1.8 && Math.floor(frame / 6) % 2 === 0) {
            sprite = sprites.frightened;
            // Vamos desenhar uma versão branca: aplicar tint
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.fillRect(-size / 2, -size / 2, size, size);
            ctx.restore();
            return;
        }
        sprite = sprites.frightened;
    } else {
        sprite = sprites.ghosts[g.idx];
    }

    if (sprite) {
        ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
    } else {
        ctx.fillStyle = GHOST_COLORS[g.idx];
        ctx.fillRect(-size / 2, -size / 2, size, size);
    }

    ctx.restore();
}

// ============================================================
// COLLISIONS
// ============================================================
const COLLISION_R2 = (TILE * 0.7) * (TILE * 0.7);

function checkGhostCollisions() {
    for (let i = 0; i < ghosts.length; i++) {
        const g = ghosts[i];
        const dx = g.x - player.x;
        const dy = g.y - player.y;
        if (dx * dx + dy * dy < COLLISION_R2) {
            if (g.mode === 'frightened') {
                g.mode = 'eaten';
                ghostStreak++;
                score += 200 * (1 << (ghostStreak - 1));
                updateHUD();
            } else if (g.mode !== 'eaten') {
                playerDie();
                return;
            }
        }
    }
}

function playerDie() {
    lives--;
    updateHUD();
    if (lives <= 0) {
        gameOver();
    } else {
        // Reset positions
        player = makePlayer();
        ghosts = [0, 1, 2, 3].map(makeGhost);
        powerTimer = 0;
    }
}

// ============================================================
// DRAW MAP
// ============================================================
function buildMapBackground() {
    // Renderiza paredes UMA VEZ em canvas off-screen — caro por causa do shadowBlur,
    // mas só roda no início e quando o jogo reseta.
    const bg = document.createElement('canvas');
    bg.width = LOGICAL_W;
    bg.height = LOGICAL_H;
    const c = bg.getContext('2d');

    const isW = (cc, rr) => tileAt(cc, rr) === T.WALL;

    // 1) Preenche fundo das paredes (sem glow)
    c.fillStyle = '#0a0a3a';
    for (let r = 0; r < ROWS; r++) {
        for (let cc = 0; cc < COLS; cc++) {
            if (map[r][cc] === T.WALL) c.fillRect(cc * TILE, r * TILE, TILE, TILE);
        }
    }

    // 2) Desenha bordas neon (com glow) em um path único — 1 stroke total
    c.strokeStyle = '#3b6cff';
    c.lineWidth = 2;
    c.shadowColor = '#3b6cff';
    c.shadowBlur = 6;
    c.beginPath();
    for (let r = 0; r < ROWS; r++) {
        for (let cc = 0; cc < COLS; cc++) {
            if (map[r][cc] !== T.WALL) continue;
            const x = cc * TILE, y = r * TILE;
            if (!isW(cc, r - 1)) { c.moveTo(x, y + 1); c.lineTo(x + TILE, y + 1); }
            if (!isW(cc, r + 1)) { c.moveTo(x, y + TILE - 1); c.lineTo(x + TILE, y + TILE - 1); }
            if (!isW(cc - 1, r)) { c.moveTo(x + 1, y); c.lineTo(x + 1, y + TILE); }
            if (!isW(cc + 1, r)) { c.moveTo(x + TILE - 1, y); c.lineTo(x + TILE - 1, y + TILE); }
        }
    }
    c.stroke();
    c.shadowBlur = 0;

    // 3) Porta da casa dos fantasmas
    for (let r = 0; r < ROWS; r++) {
        for (let cc = 0; cc < COLS; cc++) {
            if (map[r][cc] === T.DOOR) {
                c.fillStyle = '#ff77ff';
                c.fillRect(cc * TILE, r * TILE + TILE / 2 - 2, TILE, 3);
            }
        }
    }

    mapBgCanvas = bg;
}

function drawMap() {
    // Blit do background pré-renderizado (paredes + porta)
    if (mapBgCanvas) ctx.drawImage(mapBgCanvas, 0, 0);

    // Pellets e power pellets (mudam, então desenhamos a cada frame)
    const pulse = 4 + Math.sin(frame * 0.18) * 1.5;
    ctx.fillStyle = '#ffe6a8';
    ctx.beginPath();
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const t = map[r][c];
            if (t === T.PELLET) {
                const x = c * TILE + TILE / 2;
                const y = r * TILE + TILE / 2;
                ctx.moveTo(x + 2, y);
                ctx.arc(x, y, 2, 0, Math.PI * 2);
            }
        }
    }
    ctx.fill();

    // Power pellets — efeito glow simulado com 2 fills concêntricos (sem shadowBlur)
    // Camada 1: aura translúcida grande
    ctx.fillStyle = 'rgba(255,230,168,0.35)';
    ctx.beginPath();
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (map[r][c] === T.POWER) {
                const x = c * TILE + TILE / 2;
                const y = r * TILE + TILE / 2;
                ctx.moveTo(x + pulse + 3, y);
                ctx.arc(x, y, pulse + 3, 0, Math.PI * 2);
            }
        }
    }
    ctx.fill();
    // Camada 2: núcleo sólido
    ctx.fillStyle = '#fff7d6';
    ctx.beginPath();
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (map[r][c] === T.POWER) {
                const x = c * TILE + TILE / 2;
                const y = r * TILE + TILE / 2;
                ctx.moveTo(x + pulse, y);
                ctx.arc(x, y, pulse, 0, Math.PI * 2);
            }
        }
    }
    ctx.fill();
}

// ============================================================
// INPUT
// ============================================================
const KEY_MAP = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    KeyW:    [0, -1], KeyS:      [0, 1], KeyA:      [-1, 0], KeyD:       [1, 0],
};

window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
        if (state === 'playing') { state = 'paused'; showOverlay('PAUSADO', 'Pressione ESC ou clique JOGAR para continuar'); }
        else if (state === 'paused') { state = 'playing'; hideOverlay(); }
        return;
    }
    const dir = KEY_MAP[e.code];
    if (dir && state === 'playing') {
        player.nextDx = dir[0];
        player.nextDy = dir[1];
        e.preventDefault();
    }
});

startBtn.addEventListener('click', () => {
    if (state === 'paused') { state = 'playing'; hideOverlay(); return; }
    startGame();
});

// ============================================================
// GAME FLOW
// ============================================================
function startGame() {
    score = 0;
    lives = 3;
    buildMap();
    buildMapBackground();
    player = makePlayer();
    ghosts = [0, 1, 2, 3].map(makeGhost);
    powerTimer = 0;
    state = 'playing';
    updateHUD();
    hideOverlay();
}

function gameOver() {
    state = 'dead';
    showOverlay('GAME OVER', `Pontuação final: ${score}<br>Os Ronaldos te pegaram!`);
    startBtn.textContent = 'JOGAR DE NOVO';
}

function win() {
    state = 'won';
    showOverlay('VITÓRIA!', `Pontuação: ${score}<br>A Isadora venceu todos os Ronaldos!`);
    startBtn.textContent = 'JOGAR DE NOVO';
}

function showOverlay(title, msg) {
    overlayTitle.textContent = title;
    overlayMsg.innerHTML = msg;
    overlay.classList.remove('hidden');
}

function hideOverlay() {
    overlay.classList.add('hidden');
}

function updateHUD() {
    scoreEl.textContent = score;
    livesEl.textContent = lives;
}

// ============================================================
// MAIN LOOP
// ============================================================
function tick(ts) {
    if (!lastTs) lastTs = ts;
    const rawDt = (ts - lastTs) / 1000;
    const dt = Math.min(0.05, rawDt); // clamp p/ evitar pulos grandes
    lastTs = ts;
    frame++;

    // Indicador de FPS (atualiza a cada 0.5s)
    if (rawDt > 0) {
        fpsAcc += 1 / rawDt;
        fpsCount++;
        fpsTimer += rawDt;
        if (fpsTimer >= 0.5) {
            fpsEl.textContent = Math.round(fpsAcc / fpsCount);
            fpsAcc = 0; fpsCount = 0; fpsTimer = 0;
        }
    }

    // Update
    if (state === 'playing') {
        updatePlayer(dt);
        for (let i = 0; i < ghosts.length; i++) updateGhost(ghosts[i], dt);
        checkGhostCollisions();
        if (powerTimer > 0) powerTimer -= dt;
    }

    // Draw
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    drawMap();
    if (player) drawPlayer();
    for (let i = 0; i < ghosts.length; i++) drawGhost(ghosts[i]);

    requestAnimationFrame(tick);
}

// ============================================================
// BOOT
// ============================================================
(async function init() {
    buildMap();
    buildMapBackground();
    player = makePlayer();
    ghosts = [0, 1, 2, 3].map(makeGhost);
    updateHUD();

    try {
        await loadAssets();
    } catch (err) {
        console.error('Erro carregando imagens:', err);
        overlayMsg.innerHTML = 'Erro ao carregar imagens.<br>' +
            'Rode num servidor local:<br><code>python3 -m http.server</code><br>' +
            'depois abra <code>http://localhost:8000</code>';
    }

    requestAnimationFrame(tick);
})();
