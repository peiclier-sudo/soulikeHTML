/**
 * Generic Object Pool - Reusable object management for performance
 */

export class ObjectPool {
    constructor(createFn, resetFn, initialSize = 10) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.pool = [];
        this.activeObjects = new Set();
        
        // Pre-populate pool
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.createFn());
        }
    }
    
    get() {
        let obj;
        
        if (this.pool.length > 0) {
            obj = this.pool.pop();
        } else {
            obj = this.createFn();
        }
        
        this.activeObjects.add(obj);
        return obj;
    }
    
    release(obj) {
        if (this.activeObjects.has(obj)) {
            this.activeObjects.delete(obj);
            this.resetFn(obj);
            this.pool.push(obj);
        }
    }
    
    releaseAll() {
        for (const obj of this.activeObjects) {
            this.resetFn(obj);
            this.pool.push(obj);
        }
        this.activeObjects.clear();
    }
    
    getActiveCount() {
        return this.activeObjects.size;
    }
    
    getPoolSize() {
        return this.pool.length;
    }
    
    forEach(callback) {
        for (const obj of this.activeObjects) {
            callback(obj);
        }
    }
}

/**
 * LOD (Level of Detail) Manager
 */
export class LODManager {
    constructor(camera) {
        this.camera = camera;
        this.lodObjects = [];
        
        // Distance thresholds
        this.thresholds = {
            high: 20,
            medium: 50,
            low: 100
        };
    }
    
    register(object, highDetail, mediumDetail, lowDetail) {
        this.lodObjects.push({
            position: object.position,
            levels: {
                high: highDetail,
                medium: mediumDetail,
                low: lowDetail
            },
            currentLevel: 'high'
        });
    }
    
    update() {
        const cameraPos = this.camera.position;
        
        for (const obj of this.lodObjects) {
            const distance = cameraPos.distanceTo(obj.position);
            let newLevel;
            
            if (distance < this.thresholds.high) {
                newLevel = 'high';
            } else if (distance < this.thresholds.medium) {
                newLevel = 'medium';
            } else {
                newLevel = 'low';
            }
            
            if (newLevel !== obj.currentLevel) {
                // Hide current level
                if (obj.levels[obj.currentLevel]) {
                    obj.levels[obj.currentLevel].visible = false;
                }
                // Show new level
                if (obj.levels[newLevel]) {
                    obj.levels[newLevel].visible = true;
                }
                obj.currentLevel = newLevel;
            }
        }
    }
    
    setThresholds(high, medium, low) {
        this.thresholds = { high, medium, low };
    }
}

/**
 * Performance Monitor
 */
export class PerformanceMonitor {
    constructor() {
        this.frameTimes = [];
        this.maxSamples = 60;
        this.lastTime = performance.now();
    }
    
    beginFrame() {
        this.frameStart = performance.now();
    }
    
    endFrame() {
        const frameTime = performance.now() - this.frameStart;
        this.frameTimes.push(frameTime);
        
        if (this.frameTimes.length > this.maxSamples) {
            this.frameTimes.shift();
        }
    }
    
    getAverageFrameTime() {
        if (this.frameTimes.length === 0) return 0;
        const sum = this.frameTimes.reduce((a, b) => a + b, 0);
        return sum / this.frameTimes.length;
    }
    
    getFPS() {
        const avgFrameTime = this.getAverageFrameTime();
        return avgFrameTime > 0 ? 1000 / avgFrameTime : 60;
    }
    
    getStats() {
        return {
            fps: Math.round(this.getFPS()),
            frameTime: this.getAverageFrameTime().toFixed(2),
            minFrameTime: Math.min(...this.frameTimes).toFixed(2),
            maxFrameTime: Math.max(...this.frameTimes).toFixed(2)
        };
    }
}

