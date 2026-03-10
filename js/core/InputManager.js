/**
 * Input Manager - Handles keyboard and mouse input
 */

export class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        
        // Current input state (code = physical key, keyChars = character for layout-independent keys)
        this.keys = {};
        this.prevKeys = {};
        this.keyChars = {};
        this.prevKeyChars = {};
        this._inputReady = false;
        this.mouse = {
            x: 0,
            y: 0,
            deltaX: 0,
            deltaY: 0,
            leftClick: false,
            rightClick: false,
            leftClickDown: false,
            rightClickDown: false,
            rightClickReleased: false
        };
        
        // Bind event handlers
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onContextMenu = this.onContextMenu.bind(this);
        
        // Add event listeners
        document.addEventListener('keydown', this.onKeyDown);
        document.addEventListener('keyup', this.onKeyUp);
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mousedown', this.onMouseDown);
        document.addEventListener('mouseup', this.onMouseUp);
        document.addEventListener('contextmenu', this.onContextMenu);
    }
    
    onKeyDown(event) {
        this.keys[event.code] = true;
        const k = event.key?.toLowerCase();
        if (k && k.length === 1) this.keyChars[k] = true;
    }
    
    onKeyUp(event) {
        this.keys[event.code] = false;
        const k = event.key?.toLowerCase();
        if (k && k.length === 1) this.keyChars[k] = false;
    }
    
    onMouseMove(event) {
        // Always track mouse position (no pointer lock — cursor is visible)
        this.mouse.x = event.clientX;
        this.mouse.y = event.clientY;
        const maxDelta = 100;
        this.mouse.deltaX += Math.max(-maxDelta, Math.min(maxDelta, event.movementX));
        this.mouse.deltaY += Math.max(-maxDelta, Math.min(maxDelta, event.movementY));
    }
    
    onMouseDown(event) {
        if (event.button === 0) {
            this.mouse.leftClick = true;
            this.mouse.leftClickDown = true;
        } else if (event.button === 2) {
            this.mouse.rightClick = true;
            this.mouse.rightClickDown = true;
        }
    }
    
    onMouseUp(event) {
        if (event.button === 0) {
            this.mouse.leftClick = false;
        } else if (event.button === 2) {
            this.mouse.rightClickReleased = this.mouse.rightClick;
            this.mouse.rightClick = false;
        }
    }
    
    onContextMenu(event) {
        event.preventDefault();
    }
    
    getInput() {
        if (!this._inputReady) {
            this._copyObj(this.keys, this.prevKeys);
            this._copyObj(this.keyChars, this.prevKeyChars);
            this._inputReady = true;
        }
        const bloodNovaKey = (this.keys['KeyX'] || this.keyChars['x']) && !(this.prevKeys['KeyX'] || this.prevKeyChars['x']);
        const superDashKey = (this.keys['Digit2'] || this.keys['KeyDigit2'] || this.keyChars['é']) && !(this.prevKeys['Digit2'] || this.prevKeys['KeyDigit2'] || this.prevKeyChars['é']);
        const shieldKey = (this.keys['KeyC'] || this.keyChars['c']) && !(this.prevKeys['KeyC'] || this.prevKeyChars['c']);
        const teleportKey = (this.keys['KeyV'] || this.keyChars['v'] || this.keys['KeyQ'] || this.keyChars['a']) &&
            !(this.prevKeys['KeyV'] || this.prevKeyChars['v'] || this.prevKeys['KeyQ'] || this.prevKeyChars['a']);
        const healthPotionKey = (this.keys['KeyDigit1'] || this.keyChars['&']) && !(this.prevKeys['KeyDigit1'] || this.prevKeyChars['&']);

        // Charged attack: hold right-click to charge, release to fire
        // Right-click tap (down+release) = basic attack
        const isCharging = this.mouse.rightClick;
        const wasCharging = this._wasCharging || false;
        const chargedRelease = wasCharging && !isCharging;
        this._wasCharging = isCharging;

        return {
            // Actions
            jump: this.keys['Space'],
            dash: this.keys['KeyR'],   // R = dash forward
            superDash: superDashKey, // é (AZERTY Digit2) = Super Dash
            ultimate: this.keys['KeyF'], // F = Ultimate when bar full
            crimsonEruption: this.keys['KeyQ'] && !this.prevKeys['KeyQ'], // A on AZERTY (KeyQ) = Crimson Eruption
            whipAttack: this.keys['KeyE'] && !this.prevKeys['KeyE'],     // E (AZERTY) = Whip attack
            bloodNova: bloodNovaKey, // X = Blood Nova / Toxic Focus (dagger)
            lifeDrain: false,       // Legacy input path disabled (replaced by Blood Nova)
            shield: shieldKey,       // C = Blood shield / Vanish (dagger)
            teleport: teleportKey,   // V = Teleport Behind (dagger kit)
            healthPotion: healthPotionKey, // & = Health potion (AZERTY: KeyDigit1 or key that types '&')
            interact: this.keys['KeyE'],

            // Combat (right-click = attack, Shift+right = charged attack)
            attack: this.mouse.rightClickDown,
            chargedAttack: isCharging,
            chargedAttackRelease: chargedRelease,
            leftClickDown: this.mouse.leftClickDown,

            // Movement (left-click = hold to follow cursor, release to autopilot to last pos)
            leftClickMove: this.mouse.leftClick,

            // Camera
            mouseDeltaX: this.mouse.deltaX,
            mouseDeltaY: this.mouse.deltaY,
            mouseScreenX: this.mouse.x,
            mouseScreenY: this.mouse.y,

            // UI
            inventory: this.keys['KeyI'],
            pause: this.keys['Escape']
        };
    }
    
    /** Copy own enumerable props from src → dst without allocating a new object */
    _copyObj(src, dst) {
        for (const k in dst) {
            if (!(k in src)) delete dst[k];
        }
        for (const k in src) {
            dst[k] = src[k];
        }
    }

    resetFrameInput() {
        this._copyObj(this.keys, this.prevKeys);
        this._copyObj(this.keyChars, this.prevKeyChars);
        this.mouse.deltaX = 0;
        this.mouse.deltaY = 0;
        this.mouse.leftClickDown = false;
        this.mouse.rightClickDown = false;
        this.mouse.rightClickReleased = false;
    }
    
    isKeyPressed(code) {
        return this.keys[code] || false;
    }
    
    destroy() {
        document.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('keyup', this.onKeyUp);
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mousedown', this.onMouseDown);
        document.removeEventListener('mouseup', this.onMouseUp);
        document.removeEventListener('contextmenu', this.onContextMenu);
    }
}
