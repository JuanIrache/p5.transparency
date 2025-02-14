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
      queue.sort((a, b) => a.z - b.z)
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
        if (!this.renderer.states) {
          for (const key in item.currentState) {
            states[key] = item.currentState[key]
            if (item.currentState[key] instanceof Array) {
              states[key] = states[key].slice()
            }
          }
          if (item.uModelMatrix) states.uModelMatrix = item.uModelMatrix.copy()
          if (item.uViewMatrix) states.uViewMatrix = item.uViewMatrix.copy()
          if (item.uMVMatrix) states.uMVMatrix = item.uMVMatrix.copy()
          if (item.uPMatrix) states.uPMatrix = item.uPMatrix.copy()
        } else {
          for (const key in item.currentState) {
            states.setValue(key, item.currentState[key])
          }
          if (item.uModelMatrix) states.setValue('uModelMatrix', item.uModelMatrix.copy())
          if (item.uViewMatrix) states.setValue('uViewMatrix', item.uViewMatrix.copy())
          if (item.uMVMatrix) states.setValue('uMVMatrix', item.uMVMatrix.copy())
          if (item.uPMatrix) states.setValue('uPMatrix', item.uPMatrix.copy())
        }
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
      let currentState
      if (this.renderer.states) {
        currentState = { ...this.renderer.states }
      } else {
        currentState = this.renderer.push()
        this.renderer.pop(currentState)
        currentState = { ...currentState.properties }
      }
      let uModelMatrix, uViewMatrix, uMVMatrix
      if (states.uModelMatrix) {
        uModelMatrix = states.uModelMatrix.copy()
        uViewMatrix = states.uViewMatrix.copy()
        uMVMatrix = uModelMatrix.copy().mult(uViewMatrix)
      } else {
        uMVMatrix = states.uMVMatrix.copy()
      }
      const uPMatrix = states.uPMatrix.copy()
      const world = uMVMatrix.multiplyPoint(new p5.Vector(0, 0, 0))
      const item = {
        run: cb,
        z: world.z,
        uModelMatrix,
        uViewMatrix,
        uMVMatrix,
        uPMatrix,
        twoSided,
        currentState,
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
    { method: 'redraw', onClass: p5, after: true },
    { method: '_clearClip', onClass: p5.RendererGL },
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
  if (!isClipping && $1.a <= 0.) discard;
  `
        ).replace('void main', 'uniform bool isClipping;\nvoid main'),
        ...rest
      )
    }
  }
  
  const prevBeginClip = p5.RendererGL.prototype.beginClip
  p5.RendererGL.prototype.beginClip = function(options) {
    this._drawingClipMask = true
    prevBeginClip.call(this, options)
  }
  
  const prevEndClip = p5.RendererGL.prototype.endClip
  p5.RendererGL.prototype.endClip = function() {
    this._drawingClipMask = false
    prevEndClip.call(this)
  }
  
  if (p5.Shader.prototype._setMatrixUniforms) {
    const oldSetMatrixUniforms = p5.Shader.prototype._setMatrixUniforms
    p5.Shader.prototype._setMatrixUniforms = function() {
      this.setUniform('isClipping', !!this._renderer._drawingClipMask)
      oldSetMatrixUniforms.call(this)
    }
  }
  
  if (p5.RendererGL.prototype._setGlobalUniforms) {
    const oldSetGlobalUniforms = p5.Shader.prototype._setGlobalUniforms
    p5.Shader.prototype._setGlobalUniforms = function(s) {
      this.setUniform('isClipping', this.drawTarget()._isClipApplied)
      oldSetGlobalUniforms.call(this, s)
    }
  }

  p5.prototype.drawTransparent = function(cb) {
    this.transparencyManager().drawTransparent(cb)
  }

  p5.prototype.drawTwoSided = function(cb) {
    this.transparencyManager().drawTransparent(cb, { twoSided: true })
  }
})(p5)
