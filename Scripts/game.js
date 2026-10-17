// ================== ИНИЦИАЛИЗАЦИЯ ==================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let W, H;
// Переменные для Delta Time (фикс скорости на разных мониторах)
let lastTime = 0;
let deltaTime = 1; 

function resize() { 
    W = canvas.width = window.innerWidth; 
    H = canvas.height = window.innerHeight; 
}
resize();
window.addEventListener('resize', resize);

// ================== YANDEX SDK ==================
let ysdk = null, player = null;
async function initYandexSDK() {
    const isYandex = window.location.hostname.includes('yandex') || window.parent !== window;
    if (!isYandex) { console.log('Локальный режим'); return; }
    try {
        if (typeof YaGames !== 'undefined') {
            ysdk = await YaGames.init();
            try { player = await ysdk.getPlayer(); } catch(e){}
        }
    } catch(e){}
}
initYandexSDK();

// ================== ЛОКАЦИИ ==================
const LOCATIONS = [
    { id:'asteroid', name:'Астероидный пояс', cssClass:'loc-asteroid', accent:'#8b7355', bg:'#1a1520', enemyColors:['#8b7355','#a08060','#6b5a45'] },
    { id:'moon',     name:'Лунная база',      cssClass:'loc-moon',     accent:'#c0c0c0', bg:'#2a2a3e', enemyColors:['#c0c0c0','#a0a0b0','#e0e0e0'] },
    { id:'mars',     name:'Марсианские пески',cssClass:'loc-mars',     accent:'#c1440e', bg:'#3e1a0a', enemyColors:['#c1440e','#ff4400','#8b2500'] },
    { id:'saturn',   name:'Кольца Сатурна',   cssClass:'loc-saturn',   accent:'#e3c98a', bg:'#3e3520', enemyColors:['#e3c98a','#ffd700','#c8b370'] },
    { id:'nebula',   name:'Туманность',       cssClass:'loc-nebula',   accent:'#a020f0', bg:'#3e0a5e', enemyColors:['#a020f0','#ff00ff','#7a10c0'] }
];

// ================== ОРУЖИЕ ==================
const WEAPONS = {
    1: { name:'Одиночная', color:'#00ffff', cooldown:12, fire:(x,y)=>[
        {x, y:y-25, vx:0, vy:-12, radius:4, damage:1, color:'#00ffff'}]},
    2: { name:'Двойная', color:'#00ff88', cooldown:11, fire:(x,y)=>[
        {x:x-8, y:y-22, vx:0, vy:-12.5, radius:4, damage:1, color:'#00ff88'},
        {x:x+8, y:y-22, vx:0, vy:-12.5, radius:4, damage:1, color:'#00ff88'}]},
    3: { name:'Тройная', color:'#ffaa00', cooldown:10, fire:(x,y)=>[
        {x, y:y-26, vx:0, vy:-13, radius:4, damage:2, color:'#ffaa00'},
        {x:x-12, y:y-18, vx:-2.5, vy:-12.5, radius:4, damage:1, color:'#ffaa00'},
        {x:x+12, y:y-18, vx:2.5, vy:-12.5, radius:4, damage:1, color:'#ffaa00'}]},
    4: { name:'Плазма', color:'#ff00ff', cooldown:9, fire:(x,y)=>[
        {x, y:y-28, vx:0, vy:-14, radius:7, damage:3, color:'#ff00ff', plasma:true},
        {x:x-14, y:y-20, vx:-2, vy:-13, radius:5, damage:2, color:'#ff66ff', plasma:true},
        {x:x+14, y:y-20, vx:2, vy:-13, radius:5, damage:2, color:'#ff66ff', plasma:true}]},
    5: { name:'Лазер', color:'#ff0044', cooldown:7, fire:(x,y)=>[
        {x:x-18, y:y-22, vx:-1, vy:-15, radius:5, damage:3, color:'#ff0044', laser:true},
        {x:x-9, y:y-26, vx:0, vy:-15, radius:5, damage:3, color:'#ff0044', laser:true},
        {x, y:y-28, vx:0, vy:-15, radius:6, damage:4, color:'#ff0066', laser:true},
        {x:x+9, y:y-26, vx:0, vy:-15, radius:5, damage:3, color:'#ff0044', laser:true},
        {x:x+18, y:y-22, vx:1, vy:-15, radius:5, damage:3, color:'#ff0044', laser:true}]}
};

function getMultiFire(x, y, count) {
    const bullets = [];
    const totalWidth = 60;
    for (let i = 0; i < count; i++) {
        const offset = (i - (count-1)/2) * (totalWidth / Math.max(1, count-1));
        bullets.push({
            x: x + offset, y: y - 22,
            vx: offset * 0.12, vy: -13,
            radius: 4, damage: 2, color: '#ff00ff', plasma: true
        });
    }
    return bullets;
}

const getWeapon = () => WEAPONS[game.weaponLevel] || WEAPONS[1];

// ================== БАФЫ ==================
const POWERUP_TYPES = [
    { id:'points', color:'#ffaa00', icon:'$', chance:0.35, label:'+ОЧКИ' },
    { id:'points2',color:'#ffcc00', icon:'$', chance:0.15, label:'+ОЧКИ x2' },
    { id:'multi',  color:'#ff0066', icon:'M', chance:0.15, label:'МУЛЬТИВЫСТРЕЛ' },
    { id:'shield', color:'#ffd700', icon:'S', chance:0.12, label:'ЩИТ 5 СЕК' },
    { id:'freeze', color:'#00ffff', icon:'F', chance:0.10, label:'ЗАМОРОЗКА' },
    { id:'speed',  color:'#ff8800', icon:'>', chance:0.08, label:'УСКОРЕНИЕ' },
    { id:'heal',   color:'#2ecc71', icon:'+', chance:0.05, label:'+1 ЖИЗНЬ' }
];

// ================== СОСТОЯНИЕ ==================
const game = {
    state:'menu',
    score:0,
    best: parseInt(localStorage.getItem('bestScore') || '0'),
    wave:1, totalWave:1, locationIndex:0,
    level:1,
    lives:3, maxLives:5, frame:0,
    stars:[], bullets:[], enemies:[], particles:[], powerups:[], enemyBullets:[],
    lastShot:0, waveTimer:0, enemySpawnTimer:0, enemySpawnRate:90,
    weaponLevel:1,
    shieldTime:0, freezeTime:0, speedBoost:0,
    multiShotTime:0, multiShotCount:3,
    boss:null, isTraveling:false,
    upgrades: {
        bulletSpeed:0, damageBonus:0, fireRateBonus:0,
        extraLives:0, magnetRadius:0
    }
};

const playerObj = { x:0, y:0, targetX:0, targetY:0, radius:26, speed:0.18 };

// ================== ЗВЁЗДЫ ==================
function initStars() {
    game.stars = [];
    for (let i=0; i<180; i++) {
        game.stars.push({
            x: Math.random()*W, y: Math.random()*H,
            size: Math.random()*2+0.4, speed: Math.random()*2+0.5
        });
    }
}
initStars();

// ================== УПРАВЛЕНИЕ ==================
function handlePointerMove(x, y) { playerObj.targetX = x; playerObj.targetY = y; }
canvas.addEventListener('mousemove', e => { if (game.state==='playing') handlePointerMove(e.clientX, e.clientY); });
canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (game.state==='playing') handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
}, {passive:false});
canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (game.state==='playing') handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
}, {passive:false});

// ================== ПАУЗА ==================
document.addEventListener('keydown', e => {
    if (e.code === 'Space') {
        e.preventDefault();
        if (game.state === 'playing') pauseGame();
        else if (game.state === 'paused') resumeGame();
    }
});

function pauseGame() {
    if (game.state !== 'playing') return;
    game.state = 'paused';
    canvas.classList.add('paused');
    document.getElementById('pauseLevel').textContent = game.level;
    document.getElementById('pauseLocation').textContent = LOCATIONS[game.locationIndex % LOCATIONS.length].name;
    document.getElementById('pauseWave').textContent = game.wave;
    document.getElementById('pauseScore').textContent = game.score;
    document.getElementById('pauseWeapon').textContent = game.weaponLevel;
    document.getElementById('pauseScreen').classList.remove('hidden');
}
function resumeGame() {
    if (game.state !== 'paused') return;
    game.state = 'playing';
    canvas.classList.remove('paused');
    document.getElementById('pauseScreen').classList.add('hidden');
}

// ================== СКОРОСТЬ ==================
function getEnemyBaseSpeed() {
    const waveInLoc = ((game.wave - 1) % 10) + 1;

    let speed;
    if (game.locationIndex === 0 && waveInLoc <= 3) {
        speed = 0.35 + waveInLoc * 0.06;
    } else {
        speed = 0.7 + waveInLoc * 0.10 + game.locationIndex * 0.18;
    }
    speed += game.upgrades.bulletSpeed * 0.05;
    return Math.min(speed, 2.6);
}
function getBulletSpeedMul() { return 1 + game.upgrades.bulletSpeed * 0.08; }

// ================== СПАВН ВРАГОВ ==================
function spawnEnemy() {
    const waveInLoc = ((game.wave - 1) % 10) + 1;
    const locIdx = game.locationIndex;
    const loc = LOCATIONS[locIdx % LOCATIONS.length];

    let pool = ['asteroid'];
    if (game.locationIndex === 0 && waveInLoc <= 3) {
        pool = ['asteroid'];
    } else {
        if (waveInLoc >= 2) pool.push('asteroid');
        if (waveInLoc >= 3) pool.push('ufo');
        if (waveInLoc >= 4) pool.push('fighter');
        if (waveInLoc >= 5) pool.push('shooter');
        if (waveInLoc >= 6) pool.push('bomber');
        if (waveInLoc >= 7) pool.push('kamikaze');
    }

    const type = pool[Math.floor(Math.random() * pool.length)];
    const speedBonus = getEnemyBaseSpeed();
    const enemyColor = loc.enemyColors[Math.floor(Math.random()*loc.enemyColors.length)];

    let radius, hp, vx, vy, special = null, color = enemyColor;

    switch (type) {
        case 'ufo':
            radius = 16; hp = 2 + Math.floor(game.wave / 4);
            vx = (Math.random()-0.5)*1.2; vy = speedBonus * 0.85;
            break;
        case 'fighter':
            radius = 14; hp = 2; vx = 0; vy = speedBonus * 0.6;
            special = 'homing';
            break;
        case 'shooter':
            radius = 16; hp = 3;
            vx = (Math.random()-0.5)*0.6; vy = speedBonus * 0.5;
            special = 'shootDown';
            break;
        case 'bomber':
            radius = 18; hp = 3; vx = 0; vy = speedBonus * 0.5;
            special = 'exploder';
            break;
        case 'kamikaze':
            radius = 12; hp = 2; vx = 0; vy = speedBonus * 0.4;
            special = 'kamikaze';
            break;
        default: // asteroid
            radius = Math.random()*14 + 14;
            hp = Math.ceil(radius / 8);
            vx = (Math.random()-0.5)*0.8; vy = speedBonus + Math.random()*0.4;
    }

    game.enemies.push({
        x: Math.random()*(W - radius*2) + radius,
        y: -radius, vx, vy, radius, hp, maxHp:hp,
        type, special, color,
        angle:0, rotation:(Math.random()-0.5)*0.05, age:0,
        shootTimer: 60 + Math.random()*60,
        explosionRadius: 90,
        explodeTimer: 0,
        isExploding: false
    });
}

// ================== БОССЫ ==================
const BOSSES = {
    asteroid: { name:'ГЛАВНЫЙ АСТЕРОИД', hp:250, radius:85, color:'#8b7355', score:500, attack:'asteroidRain' },
    moon:     { name:'ЛУННЫЙ СТРАЖ',     hp:400, radius:90, color:'#e0d080', score:900, attack:'cheese' },
    mars:     { name:'МАРСИАНСКИЙ ТИТАН',hp:600, radius:95, color:'#c1440e', score:1400, attack:'fireballs' },
    saturn:   { name:'ВЛАДЫКА КОЛЕЦ',    hp:850, radius:100,color:'#e3c98a', score:2000, attack:'rings' },
    nebula:   { name:'ТУМАННЫЙ ПРИЗРАК', hp:1100,radius:100,color:'#a020f0', score:2700, attack:'teleport' }
};

function getCurrentBoss() {
    const loc = LOCATIONS[game.locationIndex % LOCATIONS.length];
    return BOSSES[loc.id];
}

function spawnBoss() {
    const cfg = getCurrentBoss();
    if (!cfg) return;

    game.boss = {
        x: W/2, y: -cfg.radius, vx: 1.8, vy: 1.5,
        radius: cfg.radius, hp: cfg.hp, maxHp: cfg.hp,
        name: cfg.name, color: cfg.color, score: cfg.score,
        attack: cfg.attack,
        angle:0, age:0, phase:'entering',
        attackTimer:0, attackPhase:0, subTimer:0,
        blink: 0
    };

    document.getElementById('bossName').textContent = cfg.name;
    document.getElementById('bossHpFill').style.width = '100%';
    document.getElementById('bossBar').classList.remove('hidden');
}

function hideBossBar() { document.getElementById('bossBar').classList.add('hidden'); }
function updateBossBar() {
    if (!game.boss) return;
    document.getElementById('bossHpFill').style.width = Math.max(0, game.boss.hp/game.boss.maxHp*100) + '%';
}

// ================== СТРЕЛЬБА ==================
function shoot() {
    const w = getWeapon();
    const cd = Math.max(3, w.cooldown - game.upgrades.fireRateBonus);
    // game.lastShot тоже должен учитывать время, но здесь проще оставить кадры,
    // так как это влияет только на скорость стрельбы, которая и так зависит от FPS.
    // Чтобы стрельба не была пулеметной на 144гц, привяжем lastShot к кадрам с учетом dt.
    if (game.frame - game.lastShot < cd) return;
    game.lastShot = game.frame;

    const speedMul = getBulletSpeedMul();
    const dmgBonus = game.upgrades.damageBonus;

    let bullets;
    if (game.multiShotTime > 0) {
        bullets = getMultiFire(playerObj.x, playerObj.y, game.multiShotCount);
    } else {
        bullets = w.fire(playerObj.x, playerObj.y);
    }

    for (const b of bullets) {
        b.vy *= speedMul;
        b.vx = (b.vx || 0) * speedMul;
        b.damage = (b.damage || 1) + dmgBonus;
        game.bullets.push(b);
    }
}

function createParticles(x, y, color, count=12) {
    for (let i=0; i<count; i++) {
        const a = Math.random()*Math.PI*2, s = Math.random()*5+2;
        game.particles.push({
            x, y, vx:Math.cos(a)*s, vy:Math.sin(a)*s,
            life:1, color, size:Math.random()*4+2
        });
    }
}

// ================== БАФЫ ==================
function spawnPowerup(x, y, forceId = null) {
    let chosen;
    if (forceId) {
        chosen = POWERUP_TYPES.find(p => p.id === forceId) || POWERUP_TYPES[0];
    } else {
        const roll = Math.random();
        let acc = 0;
        chosen = POWERUP_TYPES[0];
        for (const p of POWERUP_TYPES) {
            acc += p.chance;
            if (roll <= acc) { chosen = p; break; }
        }
    }
    game.powerups.push({ x, y, type:chosen, vy:1.5, radius:18, age:0 });
}

let toastTimer = null;
function showToast(text, cls='') {
    const t = document.getElementById('toast');
    t.textContent = text;
    t.className = 'toast show ' + cls;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast ' + cls; }, 1200);
}

function applyPowerup(p) {
    switch(p.type.id) {
        case 'heal':
            if (game.lives < game.maxLives) game.lives++;
            showToast('+1 ЖИЗНЬ', 'heal');
            break;
        case 'points':
            game.score += 50;
            showToast('+50 ОЧКОВ', 'points');
            break;
        case 'points2':
            game.score += 150;
            showToast('+150 ОЧКОВ', 'points');
            break;
        case 'multi':
            game.multiShotTime = 480;
            game.multiShotCount = Math.random() < 0.5 ? 4 : 5;
            showToast('МУЛЬТИВЫСТРЕЛ x' + game.multiShotCount, 'weapon');
            break;
        case 'shield':
            game.shieldTime = 300;
            showToast('ЩИТ 5 СЕК', 'shield');
            break;
        case 'freeze':
            game.freezeTime = 150;
            showToast('ЗАМОРОЗКА', 'freeze');
            break;
        case 'speed':
            game.speedBoost = 300;
            showToast('УСКОРЕНИЕ', 'freeze');
            break;
    }
}

// ================== ВЗРЫВ ==================
function explode(x, y, radius, damage, color = '#ff5500') {
    createParticles(x, y, color, 40);
    const dx = playerObj.x - x, dy = playerObj.y - y;
    const d = Math.sqrt(dx*dx + dy*dy);
    if (d < radius + playerObj.radius) {
        if (game.shieldTime > 0) {
            showToast('ЩИТ ВЫДЕРЖАЛ', 'shield');
        } else {
            game.lives -= damage;
            createParticles(playerObj.x, playerObj.y, '#ff0000', 25);
            if (game.lives <= 0) { endGame(); }
        }
    }
}

// ================== УБИЙСТВО ВРАГА ==================
function onEnemyKilled(e, index) {
    createParticles(e.x, e.y, e.color || '#ff8c00', 15);
    game.score += Math.floor(e.radius * 1.5);
    game.enemies.splice(index,1);

    if (Math.random() < 0.15) spawnPowerup(e.x, e.y);

    if (e.special === 'explodeOnDeath') {
        explode(e.x, e.y, 100, 2, '#ff5500');
    }
}

// ================== ОБНОВЛЕНИЕ (С Delta Time) ==================
function update(dt) {
    // Счетчик кадров нужен для анимаций (например, мигания), оставляем его
    game.frame += dt; 

    // Движение звезд
    for (const star of game.stars) {
        star.y += star.speed * dt;
        if (star.y > H) { star.y = -5; star.x = Math.random()*W; }
    }

    // Движение игрока
    const speedMul = game.speedBoost > 0 ? 0.28 : 0.18;
    playerObj.x += (playerObj.targetX - playerObj.x) * speedMul * dt;
    playerObj.y += (playerObj.targetY - playerObj.y) * speedMul * dt;
    playerObj.x = Math.max(30, Math.min(W-30, playerObj.x));
    playerObj.y = Math.max(80, Math.min(H-30, playerObj.y));

    shoot();

    // Таймеры способностей
    if (game.shieldTime > 0) game.shieldTime -= dt;
    if (game.freezeTime > 0) game.freezeTime -= dt;
    if (game.speedBoost > 0) game.speedBoost -= dt;
    if (game.multiShotTime > 0) game.multiShotTime -= dt;

    // Пули игрока
    for (let i = game.bullets.length-1; i>=0; i--) {
        const b = game.bullets[i];
        b.x += (b.vx || 0) * dt;
        b.y += b.vy * dt;
        if (b.y < -20 || b.x < -30 || b.x > W+30) { game.bullets.splice(i,1); continue; }

        let hit = false;
        if (game.boss && game.boss.phase === 'fighting') {
            const dx = b.x - game.boss.x, dy = b.y - game.boss.y;
            if (dx*dx + dy*dy < (game.boss.radius + b.radius) ** 2) {
                game.boss.hp -= b.damage || 1;
                game.boss.blink = 5;
                createParticles(b.x, b.y, b.color || '#00d4ff', 4);
                game.bullets.splice(i,1);
                updateBossBar();
                if (game.boss.hp <= 0) killBoss();
                continue;
            }
        }
        for (let j = game.enemies.length-1; j>=0; j--) {
            const e = game.enemies[j];
            if (e.isExploding) continue;
            const dx = b.x - e.x, dy = b.y - e.y;
            if (dx*dx + dy*dy < (e.radius + b.radius) ** 2) {
                e.hp -= b.damage || 1;
                createParticles(b.x, b.y, b.color || '#00d4ff', 4);
                game.bullets.splice(i,1);
                if (e.hp <= 0) onEnemyKilled(e, j);
                hit = true;
                break;
            }
        }
        if (hit) continue;
    }

    // Пули врагов
    for (let i = game.enemyBullets.length-1; i>=0; i--) {
        const b = game.enemyBullets[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.y > H+20 || b.y < -20 || b.x < -20 || b.x > W+20) {
            game.enemyBullets.splice(i,1); continue;
        }
        const dx = playerObj.x - b.x, dy = playerObj.y - b.y;
        if (dx*dx + dy*dy < (playerObj.radius + b.radius) ** 2) {
            game.enemyBullets.splice(i,1);
            if (game.shieldTime > 0) {
                showToast('ЩИТ ВЫДЕРЖАЛ', 'shield');
            } else {
                game.lives--;
                createParticles(playerObj.x, playerObj.y, '#ff4757', 20);
                if (game.lives <= 0) { endGame(); return; }
            }
        }
    }

    // Враги
    const eMul = game.freezeTime > 0 ? 0.3 : 1;
    for (let i = game.enemies.length-1; i>=0; i--) {
        const e = game.enemies[i];
        e.age += dt;

        // Взрывной враг
        if (e.special === 'exploder') {
            if (e.isExploding) {
                e.explodeTimer += dt;
                e.radius = 18 + e.explodeTimer * 2;
                if (e.explodeTimer > 30) {
                    explode(e.x, e.y, e.explosionRadius, 1, '#ff8800');
                    game.enemies.splice(i, 1);
                    continue;
                }
            } else {
                const dx = playerObj.x - e.x, dy = playerObj.y - e.y;
                const d = Math.sqrt(dx*dx + dy*dy) || 1;
                e.vx += (dx/d) * 0.15 * dt;
                e.vy += (dy/d) * 0.15 * dt;
                const spd = Math.sqrt(e.vx*e.vx + e.vy*e.vy);
                const maxSpd = getEnemyBaseSpeed() + 0.5;
                if (spd > maxSpd) { e.vx = e.vx/spd*maxSpd; e.vy = e.vy/spd*maxSpd; }
                if (d < e.explosionRadius * 0.8) {
                    e.isExploding = true;
                    e.explodeTimer = 0;
                    e.vx = 0; e.vy = 0;
                    showToast('ОПАСНО!', 'heal');
                }
            }
        }

        // Стрелок
        if (e.special === 'shootDown' && !e.isExploding) {
            e.shootTimer -= dt;
            if (e.shootTimer <= 0 && e.y > 0 && e.y < H*0.7) {
                e.shootTimer = 80 + Math.random()*40;
                const dx = playerObj.x - e.x, dy = playerObj.y - e.y;
                const d = Math.sqrt(dx*dx+dy*dy) || 1;
                game.enemyBullets.push({
                    x: e.x, y: e.y,
                    vx: dx/d*4, vy: dy/d*4,
                    radius: 6, color: e.color
                });
            }
        }
        // Истребитель
        if (e.special === 'homing' && !e.isExploding) {
            const dx = playerObj.x - e.x, dy = playerObj.y - e.y;
            const d = Math.sqrt(dx*dx+dy*dy) || 1;
            e.vx += (dx/d) * 0.1 * dt;
            e.vy += (dy/d) * 0.1 * dt;
            const spd = Math.sqrt(e.vx*e.vx + e.vy*e.vy);
            const maxSpd = getEnemyBaseSpeed() + 0.4;
            if (spd > maxSpd) { e.vx = e.vx/spd*maxSpd; e.vy = e.vy/spd*maxSpd; }
        }
        // Камикадзе
        if (e.special === 'kamikaze' && !e.isExploding) {
            if (e.age > 30) {
                const dx = playerObj.x - e.x, dy = playerObj.y - e.y;
                const d = Math.sqrt(dx*dx+dy*dy) || 1;
                e.vx += (dx/d) * 0.25 * dt;
                e.vy += (dy/d) * 0.25 * dt;
                const spd = Math.sqrt(e.vx*e.vx + e.vy*e.vy);
                const maxSpd = getEnemyBaseSpeed() + 0.7;
                if (spd > maxSpd) { e.vx = e.vx/spd*maxSpd; e.vy = e.vy/spd*maxSpd; }
            }
        }

        if (!e.isExploding) {
            e.y += e.vy * eMul * dt;
            e.x += e.vx * eMul * dt;
        }
        e.angle += e.rotation * dt;
        if (e.x < e.radius || e.x > W-e.radius) {
            e.vx *= -1;
            e.x = Math.max(e.radius, Math.min(W-e.radius, e.x));
        }

        // === СТОЛКНОВЕНИЕ С ИГРОКОМ ===
        const dx = playerObj.x - e.x, dy = playerObj.y - e.y;
        const collisionDist = playerObj.radius + e.radius;
        if (dx*dx + dy*dy < collisionDist * collisionDist) {
            if (e.special === 'exploder' && !e.isExploding) {
                e.isExploding = true;
                e.explodeTimer = 0;
                e.vx = 0; e.vy = 0;
                showToast('ОПАСНО!', 'heal');
            } else {
                createParticles(e.x, e.y, '#ff4757', 20);
                game.enemies.splice(i,1);

                if (game.shieldTime > 0) {
                    showToast('ЩИТ ВЫДЕРЖАЛ', 'shield');
                } else {
                    game.lives--;
                    createParticles(playerObj.x, playerObj.y, '#ff0000', 15);
                    if (game.lives <= 0) { endGame(); return; }
                }
            }
            continue;
        }

        if (e.y > H + e.radius + 40) game.enemies.splice(i,1);
    }

    // Босс
    updateBoss(dt);

    // Бафы — притягиваются
    const magnetR = 180 + game.upgrades.magnetRadius * 25;
    for (let i = game.powerups.length-1; i>=0; i--) {
        const p = game.powerups[i];
        p.y += p.vy * dt; 
        p.age += dt;
        const dx = playerObj.x - p.x, dy = playerObj.y - p.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < magnetR && dist > 0.1) {
            const pull = (dist < 80 ? 6 : 3) * dt;
            p.x += dx/dist * pull;
            p.y += dy/dist * pull;
        }
        if (dist < playerObj.radius + p.radius) {
            applyPowerup(p);
            createParticles(p.x, p.y, p.type.color, 20);
            game.powerups.splice(i,1);
            continue;
        }
        if (p.y > H+30) game.powerups.splice(i,1);
    }

    // Частицы
    for (let i = game.particles.length-1; i>=0; i--) {
        const p = game.particles[i];
        p.x += p.vx * dt; 
        p.y += p.vy * dt;
        p.vx *= Math.pow(0.96, dt);
        p.vy *= Math.pow(0.96, dt);
        p.life -= 0.02 * dt;
        if (p.life <= 0) game.particles.splice(i,1);
    }

    // Спавн врагов
    if (!game.boss) {
        game.enemySpawnTimer += dt;
        const waveInLoc = ((game.wave - 1) % 10) + 1;

        let baseRate = game.enemySpawnRate;
        if (game.locationIndex === 0 && waveInLoc <= 3) {
            baseRate = 130 + (3 - waveInLoc) * 30;
        }
        const spawnRate = Math.max(20, baseRate - waveInLoc * 4 - game.locationIndex * 3);

        if (game.enemySpawnTimer >= spawnRate) {
            game.enemySpawnTimer = 0;
            spawnEnemy();
            const easyStart = game.locationIndex === 0 && waveInLoc <= 3;
            if (!easyStart && waveInLoc >= 4 && Math.random() < 0.5) spawnEnemy();
        }
    }

    // Волны
    game.waveTimer += dt;
    if (game.waveTimer >= 1500 && !game.boss) {
        game.waveTimer = 0;
        advanceWave();
    }

    updateHUD();
}

// ================== АТАКИ БОССОВ ==================
function updateBoss(dt) {
    if (!game.boss) return;
    const b = game.boss;
    b.age += dt;
    if (b.blink > 0) b.blink -= dt;

    if (b.phase === 'entering') {
        b.y += 1.5 * dt;
        if (b.y >= 130) { b.y = 130; b.phase = 'fighting'; }
        return;
    }

    b.x += b.vx * dt;
    if (b.x < b.radius) { b.x = b.radius; b.vx *= -1; }
    if (b.x > W - b.radius) { b.x = W - b.radius; b.vx *= -1; }
    b.y = 130 + Math.sin(b.age * 0.03) * 25;
    b.angle += 0.01 * dt;

    b.attackTimer += dt;
    switch (b.attack) {
        case 'asteroidRain':  bossAsteroidRain(b, dt); break;
        case 'cheese':        bossCheese(b, dt); break;
        case 'fireballs':     bossFireballs(b, dt); break;
        case 'rings':         bossRings(b, dt); break;
        case 'teleport':      bossTeleport(b, dt); break;
    }

    b.subTimer += dt;
    if (b.subTimer > 300 && game.enemies.length < 10) {
        b.subTimer = 0;
        for (let k = 0; k < 2; k++) {
            const r = 12;
            const loc = LOCATIONS[game.locationIndex % LOCATIONS.length];
            game.enemies.push({
                x: b.x + (Math.random()-0.5)*b.radius*2,
                y: b.y + b.radius*0.5,
                vx: (Math.random()-0.5)*2, vy: 2,
                radius: r, hp: 2, maxHp: 2,
                type:'asteroid', color: loc.accent,
                angle:0, rotation:0.05, age:0, shootTimer:999
            });
        }
    }
}

function bossAsteroidRain(b, dt) {
    // Проверка таймера
    if (Math.floor(b.attackTimer / 60) !== Math.floor((b.attackTimer - dt) / 60)) {
        for (let k = 0; k < 3; k++) {
            const loc = LOCATIONS[game.locationIndex % LOCATIONS.length];
            game.enemies.push({
                x: b.x + (Math.random()-0.5)*b.radius*3,
                y: b.y,
                vx: (Math.random()-0.5)*3, vy: 3 + Math.random()*2,
                radius: 10 + Math.random()*8,
                hp: 2, maxHp: 2,
                type:'asteroid', color: loc.enemyColors[0],
                angle:0, rotation:0.08, age:0, shootTimer:999,
                isExploding:false
            });
        }
    }
}

function bossCheese(b, dt) {
    b.attackPhase = Math.floor(b.age / 300) % 2;
    if (Math.floor(b.attackTimer / 70) !== Math.floor((b.attackTimer - dt) / 70)) {
        if (b.attackPhase === 0) {
            const dx = playerObj.x - b.x, dy = playerObj.y - b.y;
            const d = Math.sqrt(dx*dx+dy*dy) || 1;
            game.enemyBullets.push({
                x: b.x, y: b.y,
                vx: dx/d*3, vy: dy/d*3,
                radius: 14, color: '#ffdd44', special:'cheese', age:0
            });
        } else {
            for (let k = -2; k <= 2; k++) {
                game.enemyBullets.push({
                    x: b.x + k*25, y: b.y,
                    vx: k*0.6, vy: 4,
                    radius: 8, color: '#ffee66', special:'cheese', age:0
                });
            }
        }
    }
}

function bossFireballs(b, dt) {
    if (Math.floor(b.attackTimer / 50) !== Math.floor((b.attackTimer - dt) / 50)) {
        const dx = playerObj.x - b.x, dy = playerObj.y - b.y;
        const d = Math.sqrt(dx*dx+dy*dy) || 1;
        game.enemyBullets.push({
            x: b.x, y: b.y,
            vx: dx/d*3.5, vy: dy/d*3.5,
            radius: 11, color: '#ff4400', special:'fireball', age:0
        });
    }
}

function bossRings(b, dt) {
    b.attackPhase = Math.floor(b.age / 400) % 3;
    
    if (Math.floor(b.attackTimer / 80) !== Math.floor((b.attackTimer - dt) / 80)) {
        if (b.attackPhase === 0) {
            const count = 12;
            for (let i = 0; i < count; i++) {
                const a = (i/count) * Math.PI*2 + b.age * 0.02;
                game.enemyBullets.push({
                    x: b.x, y: b.y,
                    vx: Math.cos(a)*2.5, vy: Math.sin(a)*2.5,
                    radius: 7, color: '#e3c98a', special:'ring', age:0
                });
            }
        } else if (b.attackPhase === 1) {
            for (let i = 0; i < 3; i++) {
                const a = (b.age * 0.1) + i * 2.1;
                game.enemyBullets.push({
                    x: b.x, y: b.y,
                    vx: Math.cos(a)*3.5, vy: Math.sin(a)*3.5,
                    radius: 8, color: '#ffd700', special:'ring', age:0
                });
            }
        } else {
            for (let k = -2; k <= 2; k++) {
                game.enemyBullets.push({
                    x: b.x + k*25, y: b.y + 20,
                    vx: k*0.3, vy: 4.5,
                    radius: 6, color: '#ffaa00', special:'ring', age:0
                });
            }
        }
    }
}

function bossTeleport(b, dt) {
    if (Math.floor(b.attackTimer / 120) !== Math.floor((b.attackTimer - dt) / 120)) {
        createParticles(b.x, b.y, b.color, 30);
        b.x = Math.random() * (W - b.radius*2) + b.radius;
        b.y = 100 + Math.random() * 100;
        createParticles(b.x, b.y, b.color, 30);
    }
    if (Math.floor(b.attackTimer / 40) !== Math.floor((b.attackTimer - dt) / 40)) {
        for (let k = -2; k <= 2; k++) {
            const a = Math.PI/2 + k*0.25;
            game.enemyBullets.push({
                x: b.x, y: b.y,
                vx: Math.cos(a)*3.5, vy: Math.sin(a)*3.5,
                radius: 8, color: '#a020f0', special:'ghost', age:0
            });
        }
    }
}

// ================== УБИЙСТВО БОССА ==================
function killBoss() {
    const b = game.boss;
    if (!b) return;

    for (let i = 0; i < 8; i++) {
        setTimeout(() => {
            createParticles(
                b.x + (Math.random()-0.5)*b.radius*2,
                b.y + (Math.random()-0.5)*b.radius*2,
                b.color, 30
            );
        }, i * 100);
    }
    game.score += b.score;
    game.boss = null;
    hideBossBar();

    for (const p of game.enemyBullets) createParticles(p.x, p.y, p.color, 5);
    game.enemyBullets = [];

    const count = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
        const a = (i/count) * Math.PI*2;
        spawnPowerup(
            W/2 + Math.cos(a)*100 + (Math.random()-0.5)*40,
            200 + Math.sin(a)*80 + (Math.random()-0.5)*40
        );
    }

    showToast('БОСС ПОВЕРЖЕН!', 'weapon');

    setTimeout(() => {
        if (game.state === 'playing') travelToNextLocation();
    }, 3000);
}

// ================== ВОЛНЫ ==================
function advanceWave() {
    game.totalWave++;
    game.wave++;
    game.enemySpawnRate = Math.max(30, game.enemySpawnRate - 4);

    const waveInLoc = ((game.wave - 1) % 10) + 1;

    if (waveInLoc === 5) {
        spawnPowerup(W/2, 100, 'multi');
        setTimeout(() => {
            if (game.state === 'playing') showUpgradeScreen();
        }, 800);
        showToast('ВОЛНА 5 — УЛУЧШЕНИЕ!', 'weapon');
        return;
    }

    if (waveInLoc === 9) {
        if (game.lives < game.maxLives) game.lives++;
        showToast('+1 ЖИЗНЬ!', 'heal');
        setTimeout(() => {
            if (game.state === 'playing') showUpgradeScreen();
        }, 800);
        return;
    }

    if (waveInLoc === 10 && !game.boss) {
        showToast('⚠ БОСС ⚠', 'weapon');
        setTimeout(() => spawnBoss(), 800);
        return;
    }

    showToast('ВОЛНА ' + game.wave, 'freeze');
}

// ================== ПРОКАЧКА ==================
const UPGRADES = [
    { id:'bulletSpeed',  icon:'⚡', title:'Скорость пуль +6%',  desc:'Пули летят немного быстрее.' },
    { id:'damageBonus',  icon:'💥', title:'Урон +1',             desc:'Каждая пуля бьёт на 1 сильнее.' },
    { id:'fireRateBonus',icon:'🔥', title:'Скорострельность +1', desc:'Стреляешь чуть чаще.' },
    { id:'extraLives',   icon:'❤️', title:'+1 макс. жизнь',      desc:'Максимум жизней растёт.' },
    { id:'magnetRadius', icon:'🧲', title:'Магнит +20',          desc:'Бафы притягиваются сильнее.' }
];

function showUpgradeScreen() {
    game.state = 'upgrade';
    document.getElementById('upgradeLevel').textContent = game.level;
    document.getElementById('upgradeWave').textContent = game.wave;

    const pool = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
    const container = document.getElementById('upgradeCards');
    container.innerHTML = '';

    for (const u of pool) {
        const card = document.createElement('div');
        card.className = 'upgrade-card';
        card.innerHTML = `
            <div class="uc-icon">${u.icon}</div>
            <div class="uc-title">${u.title}</div>
            <div class="uc-desc">${u.desc}</div>
        `;
        card.addEventListener('click', () => applyUpgrade(u.id));
        container.appendChild(card);
    }

    document.getElementById('upgradeScreen').classList.remove('hidden');
}

function applyUpgrade(id) {
    game.upgrades[id] = (game.upgrades[id] || 0) + 1;
    if (id === 'extraLives') {
        game.maxLives++;
        game.lives = Math.min(game.maxLives, game.lives + 1);
    }
    document.getElementById('upgradeScreen').classList.add('hidden');
    game.state = 'playing';
    canvas.classList.remove('paused');
    showToast('УЛУЧШЕНИЕ ПОЛУЧЕНО', 'weapon');
}

// ================== ГИПЕРПРЫЖОК ==================
function travelToNextLocation() {
    game.state = 'travel';
    game.isTraveling = true;
    game.locationIndex++;
    game.level = game.locationIndex + 1;
    game.weaponLevel = Math.min(5, game.level);

    const loc = LOCATIONS[game.locationIndex % LOCATIONS.length];

    document.getElementById('travelTitle').textContent = 'ПРЫЖОК: ' + loc.name.toUpperCase();
    document.getElementById('travelSub').textContent = 'Уровень ' + game.level;
    document.getElementById('travelBar').style.width = '0%';

    const linesContainer = document.getElementById('hyperLines');
    linesContainer.innerHTML = '';
    for (let i = 0; i < 30; i++) {
        const line = document.createElement('div');
        line.className = 'hyper-line';
        line.style.left = (Math.random()*100) + '%';
        line.style.animationDelay = (Math.random()*0.6) + 's';
        line.style.animationDuration = (0.3 + Math.random()*0.5) + 's';
        linesContainer.appendChild(line);
    }

    document.getElementById('travelScreen').classList.remove('hidden');
    canvas.className = loc.cssClass;

    let progress = 0;
    const interval = setInterval(() => {
        progress += 3;
        document.getElementById('travelBar').style.width = Math.min(100, progress) + '%';
        if (progress >= 100) {
            clearInterval(interval);
            finishTravel();
        }
    }, 40);
}

function finishTravel() {
    document.getElementById('travelScreen').classList.add('hidden');
    document.getElementById('toast').className = 'toast hidden';

    game.wave = 1;
    game.waveTimer = 0;
    game.enemySpawnTimer = 0;
    game.enemySpawnRate = Math.max(40, 90 - game.locationIndex * 10);
    game.bullets = [];
    game.enemies = [];
    game.enemyBullets = [];
    game.boss = null;
    game.isTraveling = false;
    game.state = 'playing';
    canvas.classList.remove('paused');

    game.lives = Math.min(game.maxLives, game.lives + 1);

    showToast('НОВЫЙ УРОВЕНЬ: ' + LOCATIONS[game.locationIndex % LOCATIONS.length].name, 'weapon');
}

// ================== ОТРИСОВКА ==================
function draw() {
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#fff';
    for (const star of game.stars) {
        ctx.globalAlpha = star.size / 2.5;
        ctx.beginPath(); ctx.arc(star.x, star.y, star.size, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const p of game.particles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size*p.life, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const p of game.powerups) {
        const pulse = Math.sin(p.age*0.15)*3;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.shadowBlur = 25; ctx.shadowColor = p.type.color;
        ctx.fillStyle = p.type.color;
        ctx.beginPath(); ctx.arc(0, 0, p.radius + pulse, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.type.icon, 0, 0);
        ctx.restore();
    }
    ctx.shadowBlur = 0;

    for (const e of game.enemies) drawEnemy(e);
    if (game.boss) drawBoss(game.boss);

    for (const b of game.bullets) {
        ctx.fillStyle = b.color || '#00ffff';
        ctx.shadowBlur = b.plasma ? 30 : 15;
        ctx.shadowColor = b.color || '#00ffff';
        if (b.laser) { ctx.fillRect(b.x-2, b.y-8, 4, 16); }
        else { ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI*2); ctx.fill(); }
    }

    for (const b of game.enemyBullets) {
        ctx.fillStyle = b.color;
        ctx.shadowBlur = 20; ctx.shadowColor = b.color;
        ctx.beginPath();
        if (b.special === 'cheese') {
            ctx.moveTo(-b.radius, -b.radius);
            ctx.lineTo(b.radius, -b.radius*0.5);
            ctx.lineTo(b.radius*0.5, b.radius);
            ctx.lineTo(-b.radius*0.7, b.radius*0.8);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#886600';
            ctx.beginPath(); ctx.arc(b.x, b.y, 2, 0, Math.PI*2); ctx.fill();
        } else {
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI*2);
            ctx.fill();
        }
    }
    ctx.shadowBlur = 0;

    drawPlayer();
}

function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);
    if (game.freezeTime > 0) ctx.globalAlpha = 0.7;

    const col = game.freezeTime > 0 ? '#88ddff' : (e.color || '#8b7355');

    if (e.special === 'exploder' && e.isExploding) {
        const flash = Math.floor(e.explodeTimer / 3) % 2 === 0;
        ctx.fillStyle = flash ? '#ffffff' : '#ff0000';
        ctx.shadowBlur = 40;
        ctx.shadowColor = '#ff0000';
        ctx.beginPath();
        ctx.arc(0, 0, e.radius, 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(0, 0, e.explosionRadius, 0, Math.PI*2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
        return;
    }

    ctx.fillStyle = col;
    ctx.shadowBlur = 15;
    ctx.shadowColor = col;

    switch (e.type) {
        case 'ufo':
            ctx.beginPath(); ctx.ellipse(0, 0, e.radius, e.radius*0.5, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(0, -e.radius*0.3, e.radius*0.5, 0, Math.PI*2); ctx.fill();
            break;
        case 'fighter':
            ctx.beginPath();
            ctx.moveTo(0, e.radius);
            ctx.lineTo(-e.radius, -e.radius*0.5);
            ctx.lineTo(-e.radius*0.5, -e.radius*0.8);
            ctx.lineTo(0, -e.radius*0.3);
            ctx.lineTo(e.radius*0.5, -e.radius*0.8);
            ctx.lineTo(e.radius, -e.radius*0.5);
            ctx.closePath(); ctx.fill();
            break;
        case 'shooter':
            ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(0, 0, e.radius*0.5, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(0, 0, e.radius*0.2, 0, Math.PI*2); ctx.fill();
            break;
        case 'kamikaze':
            ctx.beginPath();
            ctx.moveTo(0, e.radius);
            ctx.lineTo(-e.radius*0.7, -e.radius);
            ctx.lineTo(e.radius*0.7, -e.radius);
            ctx.closePath(); ctx.fill();
            break;
        default:
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const a = (i/8)*Math.PI*2;
                const r = e.radius * (0.8 + Math.sin(i*3 + game.frame*0.02)*0.2);
                ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
            }
            ctx.closePath(); ctx.fill();
    }

    ctx.restore();
    ctx.shadowBlur = 0;
}

function drawBoss(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);

    const flash = b.blink > 0;
    ctx.shadowBlur = 40;
    ctx.shadowColor = b.color;

    if (b.name.includes('АСТЕРОИД')) {
        ctx.fillStyle = flash ? '#fff' : b.color;
        ctx.beginPath();
        for (let i = 0; i < 14; i++) {
            const a = (i/14)*Math.PI*2;
            const r = b.radius * (0.85 + Math.sin(i*2 + b.age*0.01)*0.15);
            ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.arc(-25, -15, 14, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(20, 10, 18, 0, Math.PI*2); ctx.fill();
    } else if (b.name.includes('ЛУН')) {
        ctx.fillStyle = flash ? '#fff' : b.color;
        ctx.beginPath(); ctx.arc(0, 0, b.radius, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(200,180,100,0.5)';
        ctx.beginPath(); ctx.arc(-25, -15, 18, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(25, 20, 15, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ff0000';
        ctx.shadowBlur = 30; ctx.shadowColor = '#ff0000';
        ctx.beginPath(); ctx.arc(-18, 0, 7, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(18, 0, 7, 0, Math.PI*2); ctx.fill();
    } else if (b.name.includes('МАРС')) {
        ctx.fillStyle = flash ? '#fff' : b.color;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i/6)*Math.PI*2;
            ctx.lineTo(Math.cos(a)*b.radius, Math.sin(a)*b.radius);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff4400';
        ctx.beginPath(); ctx.arc(0, 0, b.radius*0.5, 0, Math.PI*2); ctx.fill();
    } else if (b.name.includes('КОЛЕЦ')) {
        ctx.fillStyle = flash ? '#fff' : b.color;
        ctx.beginPath(); ctx.arc(0, 0, b.radius*0.7, 0, Math.PI*2); ctx.fill();
        for (let k = 0; k < 3; k++) {
            ctx.strokeStyle = ['#e3c98a','#ffd700','#c8b370'][k];
            ctx.lineWidth = 6;
            ctx.shadowBlur = 20; ctx.shadowColor = ctx.strokeStyle;
            ctx.beginPath();
            ctx.ellipse(0, 0, b.radius*(1.0 + k*0.15), b.radius*(0.35 + k*0.1),
                        b.age*0.005 + k*0.5, 0, Math.PI*2);
            ctx.stroke();
        }
    } else if (b.name.includes('ТУМАН')) {
        ctx.fillStyle = flash ? '#fff' : b.color;
        for (let i = 0; i < 7; i++) {
            const a = (i/7)*Math.PI*2 + b.age*0.03;
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.arc(Math.cos(a)*b.radius*0.4, Math.sin(a)*b.radius*0.4,
                    b.radius*0.6, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    } else {
        ctx.fillStyle = flash ? '#fff' : b.color;
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
            const a = (i/16)*Math.PI*2;
            const r = i % 2 === 0 ? b.radius : b.radius*0.6;
            ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
        }
        ctx.closePath(); ctx.fill();
    }

    ctx.restore();
    ctx.shadowBlur = 0;
}

function drawPlayer() {
    ctx.save();
    ctx.translate(playerObj.x, playerObj.y);

    if (game.shieldTime > 0) {
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 25; ctx.shadowColor = '#ffd700';
        ctx.globalAlpha = 0.5 + Math.sin(game.frame*0.2)*0.3;
        ctx.beginPath(); ctx.arc(0, 0, playerObj.radius + 12, 0, Math.PI*2); ctx.stroke();
        ctx.globalAlpha = 1;
    }

    const flame = Math.sin(game.frame*0.3)*4;
    ctx.fillStyle = '#ff6600';
    ctx.shadowBlur = 25; ctx.shadowColor = '#ff6600';
    ctx.beginPath();
    ctx.moveTo(-8, 18); ctx.lineTo(0, 30+flame); ctx.lineTo(8, 18);
    ctx.closePath(); ctx.fill();

    let col = getWeapon().color;
    if (game.multiShotTime > 0) col = '#ff00ff';
    ctx.shadowBlur = 15; ctx.shadowColor = col;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(-15, 15); ctx.lineTo(-8, 15); ctx.lineTo(-8, 20);
    ctx.lineTo(8, 20);  ctx.lineTo(8, 15);  ctx.lineTo(15, 15);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, -5, 6, 0, Math.PI*2); ctx.fill();

    ctx.restore();
    ctx.shadowBlur = 0;
}

// ================== HUD ==================
function updateHUD() {
    document.getElementById('lives').textContent = Math.floor(game.lives);
    document.getElementById('score').textContent = game.score;
    document.getElementById('wave').textContent = game.wave;
    document.getElementById('weaponLvl').textContent = game.weaponLevel;
    document.getElementById('hudLevel').textContent = game.level;
    document.getElementById('hudLocation').textContent = LOCATIONS[game.locationIndex % LOCATIONS.length].name;
    const mh = document.getElementById('multiHud');
    if (game.multiShotTime > 0) {
        mh.style.display = '';
        document.getElementById('multiTime').textContent = Math.ceil(game.multiShotTime/60);
    } else mh.style.display = 'none';
}

// ================== ГЛАВНЫЙ ЦИКЛ (С Delta Time) ==================
function gameLoop(currentTime) {
    if (!lastTime) lastTime = currentTime;
    
    // Считаем, сколько миллисекунд прошло с прошлого кадра
    let dt = currentTime - lastTime;
    lastTime = currentTime;

    // Ограничитель, чтобы при сворачивании окна игра не "прыгала" вперед
    if (dt > 100) dt = 100; 

    // Нормализуем время: 16.667ms = 60 FPS = коэффициент 1
    deltaTime = dt / 16.667;

    if (game.state === 'playing') { 
        update(deltaTime); 
        draw(); 
    }
    else if (game.state === 'paused' || game.state === 'upgrade') { 
        draw(); 
    }
    requestAnimationFrame(gameLoop);
}

// ================== СТАРТ ==================
function startGame() {
    game.state = 'playing';
    game.score = 0;
    game.wave = 1; game.totalWave = 1;
    game.locationIndex = 0;
    game.level = 1;
    game.lives = 3; game.maxLives = 5;
    game.frame = 0;
    game.bullets = []; game.enemies = []; game.particles = [];
    game.powerups = []; game.enemyBullets = [];
    game.lastShot = 0; game.waveTimer = 0;
    game.enemySpawnTimer = 0; game.enemySpawnRate = 90;
    game.weaponLevel = 1;
    game.shieldTime = 0; game.freezeTime = 0; game.speedBoost = 0;
    game.multiShotTime = 0; game.multiShotCount = 3;
    game.boss = null; game.isTraveling = false;
    game.upgrades = {
        bulletSpeed:0, damageBonus:0, fireRateBonus:0,
        extraLives:0, magnetRadius:0
    };

    playerObj.x = W/2; playerObj.y = H - 120;
    playerObj.targetX = W/2; playerObj.targetY = H - 120;

    canvas.className = LOCATIONS[0].cssClass;
    canvas.classList.remove('paused');
    
    lastTime = 0; // Сбрасываем таймер при старте

    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('upgradeScreen').classList.add('hidden');
    document.getElementById('travelScreen').classList.add('hidden');
    document.getElementById('pauseScreen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    hideBossBar();
    updateHUD();
}

function endGame() {
    game.state = 'gameover';
    canvas.classList.add('paused');
    if (game.score > game.best) {
        game.best = game.score;
        localStorage.setItem('bestScore', game.best);
        saveToYandex(game.best);
    }
    document.getElementById('finalScore').textContent = game.score;
    document.getElementById('bestScore').textContent = game.best;
    document.getElementById('finalWave').textContent = game.wave;
    document.getElementById('finalLocation').textContent = LOCATIONS[game.locationIndex % LOCATIONS.length].name;
    document.getElementById('finalWeapon').textContent = game.weaponLevel;
    document.getElementById('gameOverScreen').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
    hideBossBar();
    showAd();
}

// ================== YANDEX ==================
async function saveToYandex(score) {
    if (!player) return;
    try { await player.setData({ bestScore: score }); } catch(e){}
}
async function loadFromYandex() {
    if (!player) return;
    try {
        const data = await player.getData(['bestScore']);
        if (data.bestScore && data.bestScore > game.best) {
            game.best = data.bestScore;
            localStorage.setItem('bestScore', game.best);
            document.getElementById('startBest').textContent = game.best;
        }
    } catch(e){}
}
let adCounter = 0;
function showAd() {
    if (!ysdk) return;
    adCounter++;
    if (adCounter % 3 === 0) {
        try { ysdk.adv.showFullscreenAdv({ callbacks:{ onClose: () => {} } }); } catch(e){}
    }
}

// ================== UI ==================
document.getElementById('playBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);
document.getElementById('startBest').textContent = game.best;

initStars();
requestAnimationFrame(gameLoop);
setTimeout(loadFromYandex, 1500);
