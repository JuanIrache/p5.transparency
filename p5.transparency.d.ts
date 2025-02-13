interface p5 {
  drawTransparent(cb: () => void): void
  drawTwoSided(cb: () => void): void
}

interface Window {
  drawTransparent(cb: () => void): void
  drawTwoSided(cb: () => void): void
}
