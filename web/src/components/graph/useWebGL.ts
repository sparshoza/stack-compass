import { useState } from 'react'

/**
 * True when this browser can create a WebGL context (the map needs one).
 * The probe context is released at once, so it does not count against the
 * browser's limit on live contexts while the map makes its own.
 */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return false
    gl.getExtension?.('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

/** Checked once per mount; the answer does not change during a visit. */
export function useWebGL(): boolean {
  const [supported] = useState(hasWebGL)
  return supported
}
