(function(p5) {
  class TransparencyManager {
    constructor(renderer) {
      this.queues = [[]]
      this.drawingItem = 0
      this.renderer = renderer
    }
    
    pushQueue() {
      this.queues.push([])
    }
    
    popQueue() {
      this.queues.pop()
    }
    
    flushQueue() {
      const queue = this.queues[this.queues.length - 1]
      if (queue.length === 0) return
      queue.sort((a, b) => b.z < a.z)
      while (queue.length > 0) {
        this.drawOrderedItem(queue.shift())
      }
    }
    
    hitFlushBoundary() {
      if (this.drawingItem > 0) return
      this.flushQueue()
    }
    
    drawOrderedItem(item) {
      this.pushQueue()
      this.drawingItem++
      const draw = () => {
        this.renderer._pInst.push()
        const states = this.renderer.states || this.renderer
        states.uModelMatrix = item.modelMatrix.copy()
        states.uViewMatrix = item.viewMatrix.copy()
        item.run()
        this.renderer._pInst.pop()
      }
      if (item.twoSided) {
        this.renderer.drawingContext.enable(this.renderer.drawingContext.CULL_FACE)
        this.renderer.drawingContext.cullFace(this.renderer.drawingContext.BACK)
        draw()
        this.renderer.drawingContext.enable(this.renderer.drawingContext.CULL_FACE)
        this.renderer.drawingContext.cullFace(this.renderer.drawingContext.FRONT)
        draw()
        this.renderer.drawingContext.disable(this.renderer.drawingContext.CULL_FACE)
      } else {
        draw()
      }
      this.drawingItem--
      this.flushQueue()
      this.popQueue()
    }
    
    drawTransparent(cb, { twoSided } = {}) {
      const states = this.renderer.states || this.renderer
      const modelMatrix = states.uModelMatrix.copy()
      const viewMatrix = states.uViewMatrix.copy()
      const mvMatrix = modelMatrix.copy().mult(viewMatrix)
      const world = mvMatrix.multiplyPoint(new p5.Vector(0, 0, 0))
      const item = {
        run: cb,
        z: world.z,
        modelMatrix,
        viewMatrix,
        twoSided,
      }
      this.queues[this.queues.length - 1].push(item)
    }
  }

  const boundaries = [
    { method: 'end', onClass: p5.Framebuffer },
    { method: 'loadPixels', onClass: p5.Framebuffer },
    { method: 'get', onClass: p5.Framebuffer },
    { method: 'loadPixels', onClass: p5 },
    { method: 'get', onClass: p5 },
    { method: 'camera', onClass: p5.Camera, condition: (cam) => cam._isActive() },
    ...['camera', 'setPosition', 'move', 'slerp', 'lookAt', 'tilt', 'pan', 'roll', 'set'].map((method) => ({
      method,
      onClass: p5.Camera,
      condition: (cam) => cam._isActive(),
    })),
    { method: 'setCamera', onClass: p5 },
    { method: 'redraw', onClass: p5, after: true },
  ]
  for (const { method, onClass, after, condition } of boundaries) {
    const oldMethod = onClass.prototype[method]
    onClass.prototype[method] = function(...args) {
      if (condition && condition(this)) {
        return oldMethod.apply(this, args)
      }
      if (!after) this.transparencyManager().hitFlushBoundary()
      const result = oldMethod.apply(this, args)
      if (after) this.transparencyManager().hitFlushBoundary()
      return result
    }
  }

  p5.prototype.transparencyManager = function() {
    return this._renderer.transparencyManager()
  }

  p5.Renderer.prototype.transparencyManager = function() {
    if (!this._transparencyManager) {
      this._transparencyManager = new TransparencyManager(this)
    }
    return this._transparencyManager
  }

  p5.Framebuffer.prototype.transparencyManager = function() {
    return (this.target ? this.target._renderer : this.renderer).transparencyManager()
  }

  p5.Camera.prototype.transparencyManager = function() {
    return this._renderer.transparencyManager()
  }

  const OldShader = p5.Shader
  p5.Shader = class Shader extends OldShader {
    constructor(renderer, vertSrc, fragSrc, ...rest) {
      super(
        renderer,
        vertSrc,
        fragSrc.replace(
          /(OUT_COLOR|gl_FragColor)\s*=\s*([^;]|\n)+;/m,
          `$&
  if ($1.a <= 0.) discard;
  `
        ),
        ...rest
      )
    }
  }

  p5.prototype.drawTransparent = function(cb) {
    this.transparencyManager().drawTransparent(cb)
  }

  p5.prototype.drawTwoSided = function(cb) {
    this.transparencyManager().drawTransparent(cb, { twoSided: true })
  }
})(p5)
