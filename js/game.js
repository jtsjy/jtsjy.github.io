(function () {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const overlay = document.getElementById('gameOverlay');
    const hudScore = document.getElementById('hudScore');
    const hudBest = document.getElementById('hudBest');

    const GROUND_Y_RATIO = 0.78;
    const PLAYER_SIZE = 34;
    const GRAVITY = 0.7;
    const JUMP_FORCE = -9.5;
    const PAD_FORCE = -13;
    const BASE_SPEED = 6.5;
    const SHIP_THRUST = 0.45;
    const SHIP_GRAVITY = 0.34;
    const SHIP_MAX_VY = 6.5;
    const CEILING_Y = 16;
    const STEP = 1000 / 60; // fixed physics step, refresh-rate independent

    let groundY, player, obstacles, particles;
    let speed, score, bestScore = 0, attempts = 0;
    let running = false, dead = false, holding = false;
    let mode = 'cube';
    let spawnTimer, spawnInterval, spawnCount;
    let nextPortalAt;
    let groundOffset = 0;
    let animFrame = null;
    let trail = [];
    let frame = 0;
    let attemptTextTimer = 0;
    let lastTime = 0;
    let accumulator = 0;

    function resize() {
        // Fixed internal resolution: identical physics on every device,
        // CSS scales the canvas to fit the container visually
        canvas.width = 640;
        canvas.height = 360;
        groundY = canvas.height * GROUND_Y_RATIO;
    }

    function init() {
        resize();
        player = {
            x: 80,
            y: groundY - PLAYER_SIZE,
            vy: 0,
            rotation: 0,
            onGround: true
        };
        obstacles = [];
        particles = [];
        trail = [];
        speed = BASE_SPEED;
        score = 0;
        spawnTimer = 0;
        spawnCount = 0;
        spawnInterval = 90;
        nextPortalAt = 10;
        mode = 'cube';
        frame = 0;
        attemptTextTimer = 80;
        lastTime = 0;
        accumulator = 0;
        dead = false;
    }

    function pressStart() {
        holding = true;
        if (!running) {
            startGame();
            return;
        }
        if (mode === 'cube' && player.onGround) {
            player.vy = JUMP_FORCE;
            player.onGround = false;
        }
    }

    function pressEnd() {
        holding = false;
    }

    function spawnObstacle() {
        let type;
        if (mode === 'ship') {
            const types = ['block', 'sawTop', 'sawBottom', 'corridor', 'corridor'];
            type = types[Math.floor(Math.random() * types.length)];
        } else if (spawnCount < 2) {
            type = 'spike';
        } else {
            const types = ['spike', 'spike', 'double', 'tall', 'saw', 'sawFloat', 'bridge', 'bridge', 'padtower', 'trap'];
            type = types[Math.floor(Math.random() * types.length)];
        }
        spawnCount++;

        let w, h, y, gapH = 0;
        switch (type) {
            case 'spike':
                w = 28; h = 40; y = groundY - h;
                break;
            case 'double':
                w = 56; h = 40; y = groundY - h;
                break;
            case 'tall':
                w = 28; h = 52; y = groundY - h;
                break;
            case 'saw':
                w = 32; h = 32; y = groundY - 16;
                break;
            case 'sawFloat':
                w = 32; h = 32; y = groundY - 90 - Math.random() * 35;
                break;
            case 'sawTop':
                w = 32; h = 32; y = CEILING_Y + 6;
                break;
            case 'sawBottom':
                w = 32; h = 32; y = groundY - 16;
                break;
            case 'pad':
            case 'padtower':
            case 'trap':
                w = 24; h = 12; y = groundY - h;
                break;
            case 'bridge':
                w = 260; h = 12; y = groundY - 58;
                break;
            case 'block':
                w = 34; h = 34 + Math.random() * 40;
                y = CEILING_Y + 30 + Math.random() * (groundY - CEILING_Y - 130);
                break;
            case 'corridor': {
                const avail = groundY - CEILING_Y;
                gapH = Math.min(100 + Math.random() * 20, avail * 0.45);
                const margin = Math.max(20, avail * 0.15);
                const gapTop = CEILING_Y + margin + Math.random() * Math.max(10, avail - gapH - margin * 2);
                w = 30; h = gapTop; y = 0;
                break;
            }
        }

        obstacles.push({ x: canvas.width + 20, y, w, h, type, angle: 0 });

        // Bridge: unjumpable spike strip underneath, platform is the only way across
        if (type === 'bridge') {
            obstacles[obstacles.length - 1].type = 'platform'; // deck must be landable
            obstacles.push({
                x: canvas.width + 20 + 40, y: groundY - 40,
                w: 200, h: 40, type: 'spikestrip', angle: 0
            });
        }

        // Trap: high platform looks optional (no spikes below),
        // but the tall wall after it is only clearable from the platform
        if (type === 'trap') {
            obstacles[obstacles.length - 1].type = 'pad'; // must bounce and render
            obstacles.push({
                x: canvas.width + 20 + 50, y: groundY - 100,
                w: 220, h: 12, type: 'platform', angle: 0
            });
            obstacles.push({
                x: canvas.width + 20 + 330, y: groundY - 80,
                w: 30, h: 80, type: 'wall', angle: 0
            });
        }

        // Pad tower: high platform only reachable by pad bounce, spikes punish staying low
        if (type === 'padtower') {
            obstacles[obstacles.length - 1].type = 'pad'; // must bounce and render
            obstacles.push({
                x: canvas.width + 20 + 50, y: groundY - 100,
                w: 220, h: 12, type: 'platform', angle: 0
            });
            obstacles.push({
                x: canvas.width + 20 + 70, y: groundY - 40,
                w: 190, h: 40, type: 'spikestrip', angle: 0
            });
        }

        // Corridor: matching bottom block, fly through the gap
        if (type === 'corridor') {
            obstacles[obstacles.length - 1].type = 'blockTop';
            const bottomY = y + h + gapH;
            obstacles.push({
                x: canvas.width + 20, y: bottomY, w,
                h: groundY - bottomY, type: 'blockBottom', angle: 0
            });
        }

        if (mode === 'ship') {
            spawnInterval = Math.max(34, 60 - spawnCount);
        } else if (spawnCount <= 2) {
            spawnInterval = 90;
        } else {
            // Min 37 frames: jump airtime is ~27 frames, guarantee landable gaps
            spawnInterval = Math.max(37, 50 - (spawnCount - 2) * 2);
            if (type === 'bridge') spawnInterval += 40;
            if (type === 'padtower') spawnInterval += 50;
            if (type === 'trap') spawnInterval += 55;
        }
    }

    function spawnPortal() {
        const type = mode === 'cube' ? 'portalShip' : 'portalCube';
        obstacles.push({
            x: canvas.width + 20,
            y: groundY - 130,
            w: 26, h: 100, type, angle: 0
        });
    }

    function createDeathExplosion() {
        // 4 cube fragments
        const half = PLAYER_SIZE / 2;
        const dirs = [
            { vx: -3.5, vy: -6 }, { vx: 3.5, vy: -6 },
            { vx: -2.5, vy: -3 }, { vx: 2.5, vy: -3 }
        ];
        dirs.forEach((d, i) => {
            particles.push({
                fragment: true,
                x: player.x + (i % 2) * half,
                y: player.y + Math.floor(i / 2) * half,
                vx: d.vx, vy: d.vy,
                rot: 0,
                vrot: (Math.random() - 0.5) * 0.4,
                size: half,
                life: 70, maxLife: 70,
                color: '#00ff41'
            });
        });
        for (let i = 0; i < 14; i++) {
            particles.push({
                x: player.x + half, y: player.y + half,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8 - 2,
                size: 2 + Math.random() * 3,
                life: 40 + Math.random() * 20, maxLife: 60,
                color: Math.random() > 0.5 ? '#00ff41' : '#00d4ff'
            });
        }
    }

    function drawBackground() {
        const hue = (frame * 0.3) % 360;
        ctx.fillStyle = 'hsla(' + hue + ', 90%, 55%, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = '#00ff4108';
        ctx.lineWidth = 1;
        for (let x = 0; x < canvas.width; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
    }

    function drawGround() {
        ctx.strokeStyle = '#00ff41';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        ctx.lineTo(canvas.width, groundY);
        ctx.stroke();

        ctx.strokeStyle = '#00ff4115';
        ctx.lineWidth = 1;
        for (let x = -groundOffset; x < canvas.width; x += 20) {
            ctx.beginPath();
            ctx.moveTo(x, groundY);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = groundY + 20; y < canvas.height; y += 20) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
    }

    function drawPlayer() {
        if (dead) return;

        trail.forEach((t, i) => {
            ctx.globalAlpha = (i / trail.length) * 0.25;
            ctx.fillStyle = mode === 'ship' ? '#00d4ff' : '#00ff41';
            ctx.fillRect(t.x + 4, t.y + 4, PLAYER_SIZE - 8, PLAYER_SIZE - 8);
        });
        ctx.globalAlpha = 1;

        ctx.save();
        ctx.translate(player.x + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2);

        if (mode === 'ship') {
            ctx.rotate(Math.max(-0.5, Math.min(0.5, player.vy * 0.08)));
        } else {
            if (!player.onGround) player.rotation += 0.12;
            else player.rotation = Math.round(player.rotation / (Math.PI / 2)) * (Math.PI / 2);
            ctx.rotate(player.rotation);
        }

        // Cube body
        ctx.fillStyle = mode === 'ship' ? '#00d4ff' : '#00ff41';
        ctx.fillRect(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(-PLAYER_SIZE / 2 + 5, -PLAYER_SIZE / 2 + 5, PLAYER_SIZE - 10, PLAYER_SIZE - 10);
        ctx.fillStyle = mode === 'ship' ? '#00d4ff' : '#00ff41';
        ctx.fillRect(-PLAYER_SIZE / 2 + 10, -PLAYER_SIZE / 2 + 10, PLAYER_SIZE - 20, PLAYER_SIZE - 20);

        // Ship flame while holding
        if (mode === 'ship' && holding) {
            ctx.fillStyle = '#ff8800';
            ctx.beginPath();
            ctx.moveTo(-PLAYER_SIZE / 2, 6);
            ctx.lineTo(-PLAYER_SIZE / 2 - 10 - Math.random() * 6, 0);
            ctx.lineTo(-PLAYER_SIZE / 2, -6);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
    }

    function drawSaw(obs) {
        ctx.save();
        ctx.translate(obs.x + obs.w / 2, obs.y + obs.h / 2);
        ctx.rotate(obs.angle);
        const r = obs.w / 2;
        ctx.fillStyle = '#ff4444';
        for (let i = 0; i < 8; i++) {
            ctx.rotate(Math.PI / 4);
            ctx.beginPath();
            ctx.moveTo(0, -r - 4);
            ctx.lineTo(4, -r + 4);
            ctx.lineTo(-4, -r + 4);
            ctx.closePath();
            ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0a0a0a';
        ctx.beginPath();
        ctx.arc(0, 0, r - 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawObstacle(obs) {
        ctx.fillStyle = '#ff4444';

        if (obs.type === 'spike' || obs.type === 'double' || obs.type === 'spikestrip') {
            const spikes = obs.type === 'double' ? 2 : obs.type === 'spikestrip' ? Math.round(obs.w / 20) : 1;
            const spikeW = obs.w / spikes;
            for (let i = 0; i < spikes; i++) {
                const sx = obs.x + i * spikeW;
                ctx.beginPath();
                ctx.moveTo(sx, obs.y + obs.h);
                ctx.lineTo(sx + spikeW / 2, obs.y);
                ctx.lineTo(sx + spikeW, obs.y + obs.h);
                ctx.closePath();
                ctx.fill();
            }
        } else if (obs.type === 'tall' || obs.type === 'wall') {
            ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
            ctx.fillStyle = '#0a0a0a';
            for (let y = obs.y + 4; y < obs.y + obs.h; y += 10) {
                ctx.fillRect(obs.x + 5, y, obs.w - 10, 5);
            }
        } else if (obs.type === 'block' || obs.type === 'blockTop' || obs.type === 'blockBottom') {
            ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(obs.x + 4, obs.y + 4, obs.w - 8, obs.h - 8);
            ctx.fillStyle = '#ff4444';
            ctx.fillRect(obs.x + 8, obs.y + 8, obs.w - 16, obs.h - 16);
        } else if (obs.type === 'platform') {
            ctx.fillStyle = '#00d4ff';
            ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(obs.x + 3, obs.y + 3, obs.w - 6, obs.h - 6);
            ctx.fillStyle = '#00d4ff';
            ctx.fillRect(obs.x + 6, obs.y + 5, obs.w - 12, 2);
        } else if (obs.type === 'saw' || obs.type === 'sawFloat' ||
                   obs.type === 'sawTop' || obs.type === 'sawBottom') {
            drawSaw(obs);
        } else if (obs.type === 'pad') {
            ctx.fillStyle = '#ffee00';
            ctx.beginPath();
            ctx.arc(obs.x + obs.w / 2, obs.y + obs.h, obs.w / 2, Math.PI, 0);
            ctx.fill();
        } else if (obs.type === 'portalShip' || obs.type === 'portalCube') {
            const color = obs.type === 'portalShip' ? '#00d4ff' : '#00ff41';
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(obs.x + obs.w / 2, obs.y + obs.h / 2, obs.w / 2, obs.h / 2, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = color + '44';
            ctx.lineWidth = 7;
            ctx.beginPath();
            ctx.ellipse(obs.x + obs.w / 2, obs.y + obs.h / 2, obs.w / 2 + 4, obs.h / 2 + 4, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    function drawParticles() {
        particles.forEach(p => {
            ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
            ctx.fillStyle = p.color;
            if (p.fragment) {
                ctx.save();
                ctx.translate(p.x + p.size / 2, p.y + p.size / 2);
                ctx.rotate(p.rot);
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();
            } else {
                ctx.fillRect(p.x, p.y, p.size, p.size);
            }
        });
        ctx.globalAlpha = 1;
    }

    function drawAttemptText() {
        if (attemptTextTimer <= 0) return;
        const alpha = Math.min(1, attemptTextTimer / 30);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#00ff41';
        ctx.font = '16px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ATTEMPT ' + attempts, canvas.width / 2, canvas.height * 0.3);
        ctx.globalAlpha = 1;
    }

    function dist(x1, y1, x2, y2) {
        return Math.hypot(x1 - x2, y1 - y2);
    }

    function checkCollision() {
        const px = player.x + 5;
        const py = player.y + 5;
        const ps = PLAYER_SIZE - 10;
        const pcx = player.x + PLAYER_SIZE / 2;
        const pcy = player.y + PLAYER_SIZE / 2;

        for (const obs of obstacles) {
            if (obs.type === 'pad' || obs.type === 'platform' ||
                obs.type === 'portalShip' || obs.type === 'portalCube') continue;

            if (obs.type === 'saw' || obs.type === 'sawFloat' ||
                obs.type === 'sawTop' || obs.type === 'sawBottom') {
                if (dist(pcx, pcy, obs.x + obs.w / 2, obs.y + obs.h / 2) < obs.w / 2 - 4 + ps / 2) {
                    return true;
                }
                continue;
            }

            let tx, ty, tw, th;
            if (obs.type === 'tall' || obs.type === 'wall' || obs.type === 'block' ||
                obs.type === 'blockTop' || obs.type === 'blockBottom') {
                tx = obs.x + 4; ty = obs.y + 4; tw = obs.w - 8; th = obs.h - 8;
            } else {
                tx = obs.x + 8; ty = obs.y + 14; tw = obs.w - 16; th = obs.h - 14;
            }

            if (px < tx + tw && px + ps > tx && py < ty + th && py + ps > ty) {
                return true;
            }
        }
        return false;
    }

    // ===== Fixed-step physics (60 Hz on any display) =====
    function tick() {
        frame++;
        groundOffset = (groundOffset + speed) % 20;

        // Physics
        if (mode === 'ship') {
            player.vy += holding ? -SHIP_THRUST : SHIP_GRAVITY;
            player.vy = Math.max(-SHIP_MAX_VY, Math.min(SHIP_MAX_VY, player.vy));
            player.y += player.vy;
            if (player.y > groundY - PLAYER_SIZE) {
                player.y = groundY - PLAYER_SIZE;
                player.vy = 0;
            }
            if (player.y < CEILING_Y) {
                player.y = CEILING_Y;
                player.vy = 0;
            }
        } else {
            const prevBottom = player.y + PLAYER_SIZE;
            player.vy += GRAVITY;
            player.y += player.vy;
            player.onGround = false;
            if (player.y >= groundY - PLAYER_SIZE) {
                player.y = groundY - PLAYER_SIZE;
                player.vy = 0;
                player.onGround = true;
            }
            // Land on platforms: strict crossing test — any frame whose fall
            // path crosses the platform top lands, no phase can slip through
            if (!player.onGround && player.vy >= 0) {
                for (const obs of obstacles) {
                    if (obs.type !== 'platform') continue;
                    const overX = player.x + PLAYER_SIZE - 6 > obs.x && player.x + 6 < obs.x + obs.w;
                    if (overX && prevBottom <= obs.y && player.y + PLAYER_SIZE >= obs.y) {
                        player.y = obs.y - PLAYER_SIZE;
                        player.vy = 0;
                        player.onGround = true;
                        break;
                    }
                }
            }
        }

        // Trail
        trail.push({ x: player.x, y: player.y });
        if (trail.length > 8) trail.shift();

        // Portal spawns only when the right edge is clear, so its approach is empty
        const portalOnScreen = obstacles.some(o => o.type === 'portalShip' || o.type === 'portalCube');
        if (score >= nextPortalAt && !portalOnScreen) {
            const nearRight = obstacles.some(o => o.x > canvas.width - 250);
            if (!nearRight) {
                spawnPortal();
                nextPortalAt += 12;
            }
        }

        // Spawn obstacles (never while a portal is approaching)
        const portalAhead = obstacles.some(o =>
            (o.type === 'portalShip' || o.type === 'portalCube') && o.x + o.w > player.x);
        spawnTimer++;
        if (spawnTimer >= spawnInterval && !portalAhead) {
            spawnObstacle();
            spawnTimer = 0;
        }

        // Move obstacles, handle pads and portals
        for (let i = obstacles.length - 1; i >= 0; i--) {
            const obs = obstacles[i];
            obs.x -= speed;

            if (obs.type === 'saw' || obs.type === 'sawFloat' ||
                obs.type === 'sawTop' || obs.type === 'sawBottom') {
                obs.angle += 0.15;
            }

            if (obs.x + obs.w < 0) {
                obstacles.splice(i, 1);
                score++;
                hudScore.textContent = score;
                continue;
            }

            // Jump pad bounce (triggers on any contact, even mid-air)
            if (obs.type === 'pad' && mode === 'cube') {
                const overX = player.x + PLAYER_SIZE - 6 > obs.x && player.x + 6 < obs.x + obs.w;
                if (overX && player.y + PLAYER_SIZE >= obs.y) {
                    player.vy = PAD_FORCE;
                    player.onGround = false;
                }
            }

            // Portal mode switch
            if ((obs.type === 'portalShip' || obs.type === 'portalCube') &&
                !obs.triggered && obs.x + obs.w / 2 < player.x + PLAYER_SIZE / 2) {
                obs.triggered = true;
                mode = obs.type === 'portalShip' ? 'ship' : 'cube';
                player.vy = 0;
                spawnTimer = -40;
            }
        }

        if (attemptTextTimer > 0) attemptTextTimer--;

        if (checkCollision()) {
            die();
        }
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground();
        drawGround();
        obstacles.forEach(drawObstacle);
        drawPlayer();
        drawParticles();
        drawAttemptText();
    }

    function loop(time) {
        if (!running) return;
        if (!lastTime) lastTime = time;
        accumulator += time - lastTime;
        lastTime = time;

        let steps = 0;
        while (accumulator >= STEP && steps < 4) {
            tick();
            accumulator -= STEP;
            steps++;
            if (!running) {
                accumulator = 0;
                return; // died mid-frame; deathAnim takes over rendering
            }
        }
        if (steps === 4) accumulator = 0; // avoid spiral after tab switch

        draw();
        animFrame = requestAnimationFrame(loop);
    }

    function die() {
        dead = true;
        running = false;
        cancelAnimationFrame(animFrame);
        createDeathExplosion();

        if (score > bestScore) {
            bestScore = score;
            hudBest.textContent = bestScore;
        }

        function deathAnim() {
            if (!dead) return; // restarted before animation finished

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawBackground();
            drawGround();
            obstacles.forEach(drawObstacle);

            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.35;
                if (p.fragment) p.rot += p.vrot;
                p.life--;
                if (p.life <= 0) particles.splice(i, 1);
            }
            drawParticles();

            if (particles.length > 0) {
                requestAnimationFrame(deathAnim);
            } else {
                showOverlay(
                    'GAME OVER',
                    'Attempt ' + attempts + ' | Score: ' + score + ' | Best: ' + bestScore,
                    'Press SPACE or Click to retry'
                );
            }
        }
        deathAnim();
    }

    function showOverlay(title, sub, hint) {
        overlay.style.display = 'flex';
        overlay.querySelector('.game-overlay-title').textContent = title;
        overlay.querySelector('.game-overlay-sub').textContent = sub;
        overlay.querySelector('.game-overlay-hint').textContent = hint;
    }

    function startGame() {
        attempts++;
        init();
        running = true;
        overlay.style.display = 'none';
        animFrame = requestAnimationFrame(loop);
    }

    document.addEventListener('keydown', (e) => {
        if (document.body.dataset.introDone !== '1') return;
        if (e.code === 'Space' || e.key === ' ' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (e.repeat) return;
            pressStart();
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.code === 'Space' || e.key === ' ' || e.key === 'ArrowUp') {
            pressEnd();
        }
    });

    canvas.addEventListener('mousedown', pressStart);
    overlay.addEventListener('mousedown', pressStart);
    document.addEventListener('mouseup', pressEnd);

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        pressStart();
    });
    canvas.addEventListener('touchend', pressEnd);

    resize();
    window.addEventListener('resize', resize);

    function drawIdle() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground();
        groundY = canvas.height * GROUND_Y_RATIO;
        drawGround();
    }
    drawIdle();
})();
