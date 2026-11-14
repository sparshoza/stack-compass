import { useState } from 'react'

/** True when this browser can create a WebGL context (the map needs one). */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** Checked once per mount; the answer does not change during a visit. */
export function useWebGL(): boolean {
  const [supported] = useState(hasWebGL)
  return supported
}
