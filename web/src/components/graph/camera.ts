import type { Camera as SigmaCamera } from 'sigma'
import type { CameraState } from 'sigma/types'

type AnimateOptions = { duration?: number; easing?: unknown }

/**
 * Makes sigma's zero-length camera animations (wheel zoom, drag inertia)
 * apply at once.
 *
 * sigma 3.0.3 runs `animate` with a duration of 0 as progress 0 / 0: the
 * camera holds NaN until the next frame fixes it. Anything that reads the
 * camera before then keeps the NaN for good, for example a release after a
 * small drag followed by the click that ends a double click, and the map
 * draws nothing from then on.
 */
export function instantCamera<C extends SigmaCamera>(camera: C): C {
  const animate = camera.animate.bind(camera) as (
    state: Partial<CameraState>,
    opts?: AnimateOptions,
    callback?: () => void,
  ) => Promise<void> | undefined
  const instant = (state: Partial<CameraState>, opts?: AnimateOptions, callback?: () => void) => {
    // The map runs no timed sigma animations (its glides set the camera
    // frame by frame), so a direct set never races one.
    if (opts?.duration === undefined || opts.duration > 0) return animate(state, opts, callback)
    camera.setState(state)
    callback?.()
    return callback ? undefined : Promise.resolve()
  }
  camera.animate = instant as SigmaCamera['animate']
  return camera
}
