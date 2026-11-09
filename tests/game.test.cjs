const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const handlers = {};
const elements = {};
function element(id) {
    return elements[id] ||= {
        style: {}, classList: { add() {}, remove() {} },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 160, height: 160 }),
        addEventListener(type, fn) { handlers[`${id}:${type}`] = fn; }
    };
}
class Object3D {
    constructor() {
        this.position = { set() {} };
        this.rotation = { y: 0 };
    }
    add() {}
    getObjectByName() { return null; }
}
const context = vm.createContext({
    document: { getElementById: element },
    window: { addEventListener(type, fn) { handlers[`window:${type}`] = fn; } },
    performance: { now: () => 0 },
    THREE: {
        Group: Object3D, Mesh: Object3D,
        MeshStandardMaterial: class {}, BoxGeometry: class {}, CylinderGeometry: class {}
    },
    setTimeout() {}
});
vm.runInContext(script, context);
const run = code => vm.runInContext(code, context);

run('setupJoystick()');
const touch = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });
handlers['joystick-zone:touchstart']({ changedTouches: [touch(1, 125, 35)], cancelable: true, preventDefault() {} });
assert.ok(run('input.moveX < 0 && input.moveZ > 0'), 'up-right moves toward screen right and forward');
handlers['window:touchend']({ changedTouches: [touch(2, 0, 0)] });
assert.ok(run('input.moveX < 0 && input.moveZ > 0'), 'releasing another finger keeps the stick active');
handlers['window:touchcancel']({ changedTouches: [touch(1, 125, 35)] });
assert.equal(run('input.length'), 0, 'cancelling the stick resets input');

run(`scene = { add() {}, remove() {} }; currentLevel = 2; buildStage()`);
assert.ok(run('dynamicObstacles.some(o => o.bounds.minZ <= 78 && o.bounds.maxZ >= stageLength)'), 'final platform reaches the level 2 goal');
run(`playerMesh = new THREE.Group(); rivalMesh = new THREE.Group();
     camera = { position: {}, lookAt() {} }; audio.playFail = () => {}; audio.playWin = () => {};
     isPlaying = true; isGameOver = false; timeRemaining = 60; keys = {};`);

function updateAt(x, y, z, angle) {
    run(`playerPos = { x: ${x}, y: ${y}, z: ${z} }; playerVel = { x: 0, y: 0, z: 0 };
         input.moveX = input.moveZ = 0; knockbackTimer = 0;
         animatedSwings = [{ group: { rotation: { y: ${angle} } }, center: { x: 0, z: 50 }, speed: 0, armLength: 3.6 }];
         updateGame(1 / 60)`);
    return run('knockbackTimer > 0');
}
assert.equal(updateAt(1, 0.9, 51, 0), false, 'space between arms is passable');
assert.equal(updateAt(1, 0.9, 50, 0), true, 'contact with an arm causes knockback');
assert.equal(updateAt(1, 2, 50, 0), false, 'jumping above an arm clears it');
assert.equal(updateAt(1, 0.9, 49, Math.PI / 4), true, 'rotated arms use their actual orientation');

run(`animatedSwings = []; knockbackTimer = 0; playerPos = { x: 0, y: 0.9, z: 2 }; playerVel = { x: 0, y: 0, z: 0 }; keys = { ArrowRight: true }; updateGame(1 / 60)`);
assert.ok(run('playerPos.x < 0'), 'right arrow moves toward screen right');
run(`keys = { ArrowUp: true }; playerPos = { x: 0, y: 0.9, z: 2 }; updateGame(1 / 60)`);
assert.ok(run('playerPos.z > 2'), 'up arrow moves toward the course');

function distanceAtFps(fps) {
    context.requestAnimationFrame = () => {};
    run(`lastTime = 0; accumulatedTime = 0; renderer = null; keys = { ArrowUp: true };
         playerPos = { x: 0, y: 0.9, z: 0 }; playerVel = { x: 0, y: 0, z: 0 };
         isPlaying = true; isGameOver = false; timeRemaining = 60;`);
    for (let frame = 1; frame <= fps; frame++) {
        context.performance.now = () => frame * 1000 / fps;
        run('animate()');
    }
    return run('playerPos.z');
}
const distance60 = distanceAtFps(60);
assert.ok(Math.abs(distanceAtFps(30) - distance60) < 0.17, '30 Hz movement matches 60 Hz');
assert.ok(Math.abs(distanceAtFps(120) - distance60) < 0.17, '120 Hz movement matches 60 Hz');

run(`keys = {}; currentLevel = 2; playerPos = { x: 0, y: 0.9, z: stageLength };
     playerVel = { x: 0, y: 0, z: 0 }; isPlaying = true; isGameOver = false; updateGame(1 / 60)`);
assert.equal(run('isGameOver && !isPlaying'), true, 'level 2 goal can be cleared');
console.log('Game movement and course checks passed');
