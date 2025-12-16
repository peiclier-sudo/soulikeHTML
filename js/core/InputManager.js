/**
 * Input Manager - Handles keyboard and mouse input
 */

export class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        
        // Current input state
        this.keys = {};
        this.mouse = {
            x: 0,
            y: 0,
            deltaX: 0,
            deltaY: 0,
            leftClick: false,
            rightClick: false,
            leftClickDown: false,
            rightClickDown: false
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
    }
    
    onKeyUp(event) {
        this.keys[event.code] = false;
    }
    
    onMouseMove(event) {
        if (document.pointerLockElement) {
            this.mouse.deltaX += event.movementX;
            this.mouse.deltaY += event.movementY;
        }
        this.mouse.x = event.clientX;
        this.mouse.y = event.clientY;
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
            this.mouse.rightClick = false;
        }
    }
    
    onContextMenu(event) {
        event.preventDefault();
    }
    
    getInput() {
        return {
            // Movement
            forward: this.keys['KeyW'] || this.keys['ArrowUp'],
            backward: this.keys['KeyS'] || this.keys['ArrowDown'],
            left: this.keys['KeyA'] || this.keys['ArrowLeft'],
            right: this.keys['KeyD'] || this.keys['ArrowRight'],
            
            // Actions
            run: this.keys['ShiftLeft'] || this.keys['ShiftRight'],
            jump: this.keys['Space'],
            dodge: this.keys['Space'], // Same as jump, context-dependent
            interact: this.keys['KeyE'],
            
            // Combat
            attack: this.mouse.leftClickDown,
            block: this.mouse.rightClick,
            heavyAttack: this.keys['KeyR'],
            
            // Camera
            mouseDeltaX: this.mouse.deltaX,
            mouseDeltaY: this.mouse.deltaY,
            
            // UI
            inventory: this.keys['KeyI'],
            pause: this.keys['Escape']
        };
    }
    
    resetFrameInput() {
        // Reset per-frame values
        this.mouse.deltaX = 0;
        this.mouse.deltaY = 0;
        this.mouse.leftClickDown = false;
        this.mouse.rightClickDown = false;
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

