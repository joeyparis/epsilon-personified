/**
 * Animation Sampler - Keyframe interpolation for JMA animations
 * Handles Halo Z-up to Three.js Y-up coordinate conversion
 * Uses slerp for quaternion interpolation, linear for position/scale
 */

import * as THREE from 'three'
import type { JmaAnimation } from './jma-parser'

export interface SampledTransform {
  position: THREE.Vector3
  rotation: THREE.Quaternion
  scale: number
}

/**
 * Samples keyframes from a JmaAnimation with proper interpolation
 * Converts from Halo Z-up right-hand to Three.js Y-up right-hand coordinates
 */
export class AnimationSampler {
  private animation: JmaAnimation
  private nodeIndex: number
  private loop: boolean

  // Pre-allocated scratch objects to avoid GC pressure
  private _tmp_pos_a = new THREE.Vector3()
  private _tmp_pos_b = new THREE.Vector3()
  private _tmp_rot_a = new THREE.Quaternion()
  private _tmp_rot_b = new THREE.Quaternion()
  private _tmp_vec3 = new THREE.Vector3()
  private _tmp_quat_result = new THREE.Quaternion()

  constructor(animation: JmaAnimation, nodeName: string, options: { loop: boolean }) {
    this.animation = animation
    this.loop = options.loop

    // Find node index by name
    const nodeIdx = animation.nodes.findIndex(n => n.name === nodeName)
    if (nodeIdx === -1) {
      throw new Error(`Node "${nodeName}" not found in animation`)
    }
    this.nodeIndex = nodeIdx
  }

  /**
   * Get animation duration in seconds
   */
  get duration(): number {
    return this.animation.frameCount / this.animation.frameRate
  }

  /**
   * Get frame rate in Hz
   */
  get frame_rate(): number {
    return this.animation.frameRate
  }

  /**
   * Sample animation at time_s, returning interpolated transform
   * Applies Halo Z-up to Three.js Y-up coordinate conversion
   */
  sample(time_s: number): SampledTransform {
    const { frameCount, frameRate, frames } = this.animation
    const nodeIdx = this.nodeIndex

    // Compute raw frame index
    let raw_frame = time_s * frameRate

    // Handle looping/clamping
    if (this.loop) {
      raw_frame = ((raw_frame % frameCount) + frameCount) % frameCount
    } else {
      raw_frame = Math.max(0, Math.min(raw_frame, frameCount - 1))
    }

    // Get frame indices and interpolation factor
    const frameA = Math.floor(raw_frame)
    let frameB = frameA + 1
    if (frameB >= frameCount) {
      if (this.loop) {
        frameB = 0
      } else {
        frameB = frameCount - 1
      }
    }
    const t = raw_frame - frameA

    // Get transforms from frames
    const transformA = frames[frameA][nodeIdx]
    const transformB = frames[frameB][nodeIdx]

    // Extract position and rotation (Halo coordinates)
    const [hx_a, hy_a, hz_a] = transformA.position
    const [qi_a, qj_a, qk_a, qw_a] = transformA.rotation
    const scale_a = transformA.scale

    const [hx_b, hy_b, hz_b] = transformB.position
    const [qi_b, qj_b, qk_b, qw_b] = transformB.rotation
    const scale_b = transformB.scale

    // Interpolate position (linear in Halo space)
    this._tmp_pos_a.set(hx_a, hy_a, hz_a)
    this._tmp_pos_b.set(hx_b, hy_b, hz_b)
    this._tmp_vec3.lerpVectors(this._tmp_pos_a, this._tmp_pos_b, t)
    const [hx, hy, hz] = [this._tmp_vec3.x, this._tmp_vec3.y, this._tmp_vec3.z]

    // Interpolate rotation (slerp in Halo space)
    this._tmp_rot_a.set(qi_a, qj_a, qk_a, qw_a)
    this._tmp_rot_b.set(qi_b, qj_b, qk_b, qw_b)
    this._tmp_quat_result.copy(this._tmp_rot_a)
    this._tmp_quat_result.slerp(this._tmp_rot_b, t)
    const [qi, qj, qk, qw] = [
      this._tmp_quat_result.x,
      this._tmp_quat_result.y,
      this._tmp_quat_result.z,
      this._tmp_quat_result.w,
    ]

    // Interpolate scale (linear)
    const scale = scale_a + (scale_b - scale_a) * t

    // Convert from Halo Z-up to Three.js Y-up
    // Position: (hx, hy, hz) -> (hx, hz, -hy)
    // Quaternion: (qi, qj, qk, qw) -> (qi, qk, -qj, qw)
    const result = new THREE.Vector3(hx, hz, -hy)
    const rotation = new THREE.Quaternion(qi, qk, -qj, qw)

    return {
      position: result,
      rotation,
      scale,
    }
  }
}

/**
 * Helper to create a sampler for idle bob offset
 * Returns a function that samples the vertical (Y in Three.js) offset from center
 * Useful for applying bob animation to camera or character position
 */
export function createIdleBobSampler(
  animation: JmaAnimation,
): { sampleOffset(time_s: number): number } {
  // Find monitor node (should be first)
  const nodeIdx = animation.nodes.findIndex(n => n.name === 'monitor')
  if (nodeIdx === -1) {
    throw new Error('Monitor node not found')
  }

  // Sample all frames to find Y range
  let minY = Infinity
  let maxY = -Infinity

  for (let f = 0; f < animation.frameCount; f++) {
    const transform = animation.frames[f][nodeIdx]
    const [, , hz] = transform.position // hz maps to Y in Three.js
    if (hz < minY) minY = hz
    if (hz > maxY) maxY = hz
  }

  const midpoint = (minY + maxY) / 2
  const halfRange = (maxY - minY) / 2

  // Degenerate animation (all frames same Y) - return zero offset to avoid division by zero.
  if (halfRange === 0) {
    return { sampleOffset: () => 0 }
  }

  // Create sampler
  const sampler = new AnimationSampler(animation, 'monitor', { loop: true })

  return {
    sampleOffset(time_s: number): number {
      const sample = sampler.sample(time_s)
      // Normalize to [-1.0, +1.0] so idle_bob_amplitude directly controls visible range.
      return (sample.position.y - midpoint) / halfRange
    },
  }
}
