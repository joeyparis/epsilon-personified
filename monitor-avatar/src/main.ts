import './style.css'

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { parseJma } from './jma-parser'
import { createIdleBobSampler, AnimationSampler } from './animation-sampler'

type material_with_emissive = THREE.Material & {
  emissive?: THREE.Color
  emissiveIntensity?: number
  map?: THREE.Texture | null
  emissiveMap?: THREE.Texture | null
  name?: string
}

type talk_target = {
  material: material_with_emissive
  base_emissive_intensity: number
  talk_weight: number
}

type material_baseline = {
  emissive_intensity: number
  emissive_hex: number
}

const model_url = '/assets/halo-reach-forge-monitor/source/NewMonitor11.fbx'
const textures_base_url = '/assets/halo-reach-forge-monitor/textures/'

// Default home look calibration (degrees 0..360).
const default_look_rot_x_deg = 0
const default_look_rot_y_deg = 270
const default_look_rot_z_deg = 14

const app_el = document.querySelector<HTMLDivElement>('#app')
if (!app_el) throw new Error('Missing #app element')

app_el.innerHTML = `
  <canvas id="scene_canvas"></canvas>
  <div id="hud">
    <h1>Monitor Avatar</h1>
    <p class="sub">Audio-driven glow “mouth” + in-browser recording (.webm)</p>

    <div class="section" data-section-id="audio">
      <h2>Audio</h2>
      <div class="row stack">
        <label>
          Audio file
          <input id="audio_file_input" type="file" accept="audio/*" />
        </label>
        <audio id="audio_el" controls preload="auto" style="width: 100%"></audio>
      </div>

      <div class="row">
        <button id="start_button" type="button" disabled>Enable audio + start</button>
        <button id="stop_button" type="button" disabled>Stop</button>
      </div>

      <div class="row">
        <button id="start_record_button" type="button" disabled>Start recording</button>
        <button id="stop_record_button" type="button" disabled>Stop recording</button>
        <a id="download_link" download hidden>Download</a>
      </div>
    </div>

    <div class="section" data-section-id="talk_glow">
      <h2>Talk glow</h2>
      <div class="row stack">
        <div class="row" style="justify-content: space-between">
          <span style="font-size: 12px; opacity: 0.9">Talk materials</span>
          <button id="select_recommended_button" type="button" disabled>Select recommended</button>
        </div>
        <div id="talk_materials_list"></div>
      </div>

      <div class="row stack">
        <span style="font-size: 12px; opacity: 0.9">Manual preview</span>
        <div class="row" style="flex-wrap: wrap">
          <button id="preview_talk_button" type="button" disabled>Preview talk</button>
          <button id="stop_preview_button" type="button" disabled>Stop preview</button>
        </div>
        <div class="row" style="flex-wrap: wrap">
          <button id="run_hover_button" type="button" disabled>Run hover</button>
          <button id="run_spin_button" type="button" disabled>Run spin</button>
          <button id="run_orbit_button" type="button" disabled>Run orbit</button>
        </div>
      </div>

      <div class="row stack">
        <label>Idle glow <input id="idle_glow" type="range" min="0" max="5" step="0.01" value="0.6" /></label>
        <label>Talk scale <input id="talk_scale" type="range" min="0" max="30" step="0.05" value="10" /></label>
        <label>Noise gate <input id="noise_gate" type="range" min="0" max="0.2" step="0.001" value="0.01" /></label>
        <label>Gain <input id="talk_gain" type="range" min="0.5" max="15" step="0.05" value="5" /></label>
        <label>Curve <input id="talk_curve" type="range" min="0.4" max="2.2" step="0.01" value="1.1" /></label>
        <label>Attack <input id="attack" type="range" min="0.05" max="0.9" step="0.01" value="0.55" /></label>
        <label>Release <input id="release" type="range" min="0.01" max="0.6" step="0.01" value="0.12" /></label>
        <label>Eye blue deepness <input id="eye_blue_deepness" type="range" min="0" max="1" step="0.01" value="0.75" /></label>
      </div>
    </div>

    <div class="section" data-section-id="rendering">
      <h2>Rendering</h2>
      <div class="row stack">
        <label>
          <input id="enable_aces" type="checkbox" checked />
          ACES tone mapping
        </label>
        <label>Exposure <input id="exposure" type="range" min="0.2" max="2.5" step="0.01" value="0.20" /></label>
        <label>Phong specular <input id="phong_specular" type="range" min="0" max="1" step="0.01" value="0.05" /></label>
        <label>Phong shininess <input id="phong_shininess" type="range" min="0" max="200" step="1" value="22" /></label>
        <label>
          <input id="enable_env" type="checkbox" checked />
          Environment reflections
        </label>
        <label>Env reflectivity <input id="env_reflectivity" type="range" min="0" max="1" step="0.01" value="0.08" /></label>

        <div class="row" style="justify-content: space-between">
          <span style="font-size: 12px; opacity: 0.9">Look rotation offset (degrees)</span>
          <button id="reset_look_rot_button" type="button">Reset</button>
        </div>

        <label>Look rot X <input id="look_rot_x_deg" type="range" min="0" max="360" step="1" value="${default_look_rot_x_deg}" /></label>
        <label>Look rot Y <input id="look_rot_y_deg" type="range" min="0" max="360" step="1" value="${default_look_rot_y_deg}" /></label>
        <label>Look rot Z <input id="look_rot_z_deg" type="range" min="0" max="360" step="1" value="${default_look_rot_z_deg}" /></label>

        <div class="row" style="justify-content: space-between">
          <span style="font-size: 12px; opacity: 0.9">Model position offset</span>
          <button id="reset_model_pose_button" type="button">Reset</button>
        </div>
        <label>Pos X <input id="model_pos_x" type="range" min="-1" max="1" step="0.01" value="0" /></label>
        <label>Pos Y <input id="model_pos_y" type="range" min="-1" max="1" step="0.01" value="0" /></label>
        <label>Pos Z <input id="model_pos_z" type="range" min="-1" max="1" step="0.01" value="0" /></label>

        <label>
          <input id="debug_home_pose" type="checkbox" />
          Debug home pose (freeze)
        </label>
      </div>
    </div>

    <div class="section" data-section-id="lights">
      <h2>Lights</h2>
      <div id="lights_list" class="row stack">
        <label><input id="enable_hemi_light" type="checkbox" checked /> Fill (hemisphere)</label>
        <label><input id="enable_dir_light" type="checkbox" checked /> Overhead (directional)</label>
        <label><input id="enable_ambient_light" type="checkbox" checked /> Ambient</label>
        <label><input id="enable_bounce_light" type="checkbox" checked /> Bounce (below)</label>
        <label><input id="enable_talk_light_inner" type="checkbox" checked /> Talk spill (LEDs + booster)</label>
        <label><input id="enable_talk_light_eye" type="checkbox" checked /> Talk spill (eye front/back)</label>
        <label><input id="enable_axes_helper" type="checkbox" checked /> Debug axes (world)</label>
        <label><input id="enable_grid_floor" type="checkbox" checked /> Grid floor</label>
        <label><input id="align_world_axes_to_model" type="checkbox" /> Align world axes to model</label>
        <label><input id="enable_model_axes_helper" type="checkbox" /> Debug axes (model)</label>
        <label><input id="enable_model_forward_helper" type="checkbox" /> Debug forward (face)</label>
      </div>

      <div class="row stack">
        <label>Overhead intensity <input id="dir_light_intensity" type="range" min="0" max="1.5" step="0.01" value="0.6" /></label>
        <label>Fill intensity <input id="hemi_light_intensity" type="range" min="0" max="2" step="0.01" value="2.0" /></label>
        <label>Ambient intensity <input id="ambient_light_intensity" type="range" min="0" max="2" step="0.01" value="2.0" /></label>
        <label>Bounce intensity <input id="bounce_light_intensity" type="range" min="0" max="12" step="0.05" value="12.0" /></label>
        <label>
          <input id="use_point_light" type="checkbox" checked />
          Enable talk spill lights
        </label>
      </div>
    </div>

    <div class="section" data-section-id="status">
      <h2>Status</h2>
      <div class="row stack">
        <small class="mono" id="status_el">Loading model…</small>
        <small class="mono" id="lights_status_el"></small>
        <small class="mono" id="render_status_el"></small>
        <small class="mono" id="look_status_el"></small>
      </div>
    </div>
  </div>
`

function mustGetElement<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`Missing element: ${selector}`)
  return el
}

const scene_canvas = mustGetElement<HTMLCanvasElement>('#scene_canvas')
const status_el = mustGetElement<HTMLElement>('#status_el')
const lights_status_el = mustGetElement<HTMLElement>('#lights_status_el')
const render_status_el = mustGetElement<HTMLElement>('#render_status_el')
const look_status_el = mustGetElement<HTMLElement>('#look_status_el')
const audio_el = mustGetElement<HTMLAudioElement>('#audio_el')

// Default to repeating playback.
audio_el.loop = true

// Allow analyser/recording when using URL-provided audio (requires CORS on the audio host).
audio_el.crossOrigin = 'anonymous'

const audio_file_input = mustGetElement<HTMLInputElement>('#audio_file_input')
const start_button = mustGetElement<HTMLButtonElement>('#start_button')
const stop_button = mustGetElement<HTMLButtonElement>('#stop_button')
const start_record_button = mustGetElement<HTMLButtonElement>('#start_record_button')
const stop_record_button = mustGetElement<HTMLButtonElement>('#stop_record_button')
const download_link = mustGetElement<HTMLAnchorElement>('#download_link')
const select_recommended_button = mustGetElement<HTMLButtonElement>('#select_recommended_button')
const preview_talk_button = mustGetElement<HTMLButtonElement>('#preview_talk_button')
const stop_preview_button = mustGetElement<HTMLButtonElement>('#stop_preview_button')
const run_hover_button = mustGetElement<HTMLButtonElement>('#run_hover_button')
const run_spin_button = mustGetElement<HTMLButtonElement>('#run_spin_button')
const run_orbit_button = mustGetElement<HTMLButtonElement>('#run_orbit_button')

const talk_materials_list = mustGetElement<HTMLDivElement>('#talk_materials_list')
const idle_glow_input = mustGetElement<HTMLInputElement>('#idle_glow')
const talk_scale_input = mustGetElement<HTMLInputElement>('#talk_scale')
const noise_gate_input = mustGetElement<HTMLInputElement>('#noise_gate')
const talk_gain_input = mustGetElement<HTMLInputElement>('#talk_gain')
const talk_curve_input = mustGetElement<HTMLInputElement>('#talk_curve')
const attack_input = mustGetElement<HTMLInputElement>('#attack')
const release_input = mustGetElement<HTMLInputElement>('#release')
const eye_blue_deepness_input = mustGetElement<HTMLInputElement>('#eye_blue_deepness')
const dir_light_intensity_input = mustGetElement<HTMLInputElement>('#dir_light_intensity')
const hemi_light_intensity_input = mustGetElement<HTMLInputElement>('#hemi_light_intensity')
const ambient_light_intensity_input = mustGetElement<HTMLInputElement>('#ambient_light_intensity')
const bounce_light_intensity_input = mustGetElement<HTMLInputElement>('#bounce_light_intensity')
const use_point_light_input = mustGetElement<HTMLInputElement>('#use_point_light')

const enable_hemi_light_input = mustGetElement<HTMLInputElement>('#enable_hemi_light')
const enable_dir_light_input = mustGetElement<HTMLInputElement>('#enable_dir_light')
const enable_ambient_light_input = mustGetElement<HTMLInputElement>('#enable_ambient_light')
const enable_bounce_light_input = mustGetElement<HTMLInputElement>('#enable_bounce_light')
const enable_talk_light_inner_input = mustGetElement<HTMLInputElement>('#enable_talk_light_inner')
const enable_talk_light_eye_input = mustGetElement<HTMLInputElement>('#enable_talk_light_eye')
const enable_axes_helper_input = mustGetElement<HTMLInputElement>('#enable_axes_helper')
const enable_grid_floor_input = mustGetElement<HTMLInputElement>('#enable_grid_floor')
const align_world_axes_to_model_input = mustGetElement<HTMLInputElement>('#align_world_axes_to_model')
const enable_model_axes_helper_input = mustGetElement<HTMLInputElement>('#enable_model_axes_helper')
const enable_model_forward_helper_input = mustGetElement<HTMLInputElement>('#enable_model_forward_helper')

const enable_aces_input = mustGetElement<HTMLInputElement>('#enable_aces')
const exposure_input = mustGetElement<HTMLInputElement>('#exposure')
const phong_specular_input = mustGetElement<HTMLInputElement>('#phong_specular')
const phong_shininess_input = mustGetElement<HTMLInputElement>('#phong_shininess')
const enable_env_input = mustGetElement<HTMLInputElement>('#enable_env')
const env_reflectivity_input = mustGetElement<HTMLInputElement>('#env_reflectivity')

const reset_look_rot_button = mustGetElement<HTMLButtonElement>('#reset_look_rot_button')
const look_rot_x_deg_input = mustGetElement<HTMLInputElement>('#look_rot_x_deg')
const look_rot_y_deg_input = mustGetElement<HTMLInputElement>('#look_rot_y_deg')
const look_rot_z_deg_input = mustGetElement<HTMLInputElement>('#look_rot_z_deg')

const reset_model_pose_button = mustGetElement<HTMLButtonElement>('#reset_model_pose_button')
const model_pos_x_input = mustGetElement<HTMLInputElement>('#model_pos_x')
const model_pos_y_input = mustGetElement<HTMLInputElement>('#model_pos_y')
const model_pos_z_input = mustGetElement<HTMLInputElement>('#model_pos_z')

const debug_home_pose_input = mustGetElement<HTMLInputElement>('#debug_home_pose')

const url_params = new URLSearchParams(window.location.search)
const initial_audio_url = url_params.get('audio')
const should_attempt_autostart = url_params.get('autostart') === '1'
const auto_record_ms = Number.parseInt(url_params.get('record_ms') ?? '0', 10) || 0

// Bundled default audio (copied from Downloads at dev-time).
const default_audio_url = '/audio/default.aac'

window.addEventListener('error', (ev) => {
  const msg = ev.error instanceof Error ? ev.error.message : ev.message
  setStatus(`Runtime error: ${msg}`)
})

window.addEventListener('unhandledrejection', (ev) => {
  const reason = ev.reason instanceof Error ? ev.reason.message : String(ev.reason)
  setStatus(`Unhandled rejection: ${reason}`)
})

if (initial_audio_url) {
  audio_el.src = initial_audio_url
  audio_el.load()
} else {
  // If no URL param is provided, load a default audio clip to save a step.
  audio_el.src = default_audio_url
  audio_el.load()
}

let auto_record_pending = auto_record_ms > 0

audio_el.addEventListener('play', async () => {
  // Ensure analysis is enabled whenever the user plays audio (including using the <audio> controls).
  try {
    ensureAudioGraph()
    if (audio_ctx?.state === 'suspended') await audio_ctx.resume()
  } catch {
    // ignore; audio can still play even if analysis is blocked
  }

  // UI state
  start_button.disabled = true
  stop_button.disabled = false

  if (!auto_record_pending) return
  auto_record_pending = false

  start_record_button.click()
  window.setTimeout(() => stop_record_button.click(), auto_record_ms)
})

audio_el.addEventListener('pause', () => {
  start_button.disabled = false
  stop_button.disabled = true
})

// Add numeric readouts next to all range sliders.
setupRangeValueLabels()
setupCollapsibleHudSections()

function setupCollapsibleHudSections(): void {
  const sections = [...document.querySelectorAll<HTMLElement>('#hud .section')]

  function getStorageKey(section_id: string): string {
    return `monitor_avatar.hud.section.${section_id}.collapsed`
  }

  function readCollapsed(section_id: string): boolean | null {
    try {
      const v = window.localStorage.getItem(getStorageKey(section_id))
      if (v === null) return null
      return v === '1'
    } catch {
      return null
    }
  }

  function writeCollapsed(section_id: string, collapsed: boolean): void {
    try {
      window.localStorage.setItem(getStorageKey(section_id), collapsed ? '1' : '0')
    } catch {
      // ignore
    }
  }

  for (const [section_index, section] of sections.entries()) {
    const h2 = section.querySelector<HTMLElement>('h2')
    if (!h2) continue

    const section_id = section.dataset.sectionId || `section_${section_index}`

    h2.tabIndex = 0
    h2.setAttribute('role', 'button')

    const setCollapsed = (collapsed: boolean, persist: boolean): void => {
      section.classList.toggle('collapsed', collapsed)
      h2.setAttribute('aria-expanded', collapsed ? 'false' : 'true')

      // Collapse behavior is handled by CSS (more robust than relying on the `hidden` attribute,
      // which can be overridden by layout rules like `.row { display: flex; }`).
      if (persist) writeCollapsed(section_id, collapsed)
    }

    const toggle = (): void => {
      const next_collapsed = !section.classList.contains('collapsed')
      setCollapsed(next_collapsed, true)
    }

    h2.addEventListener('click', toggle)
    h2.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return
      ev.preventDefault()
      toggle()
    })

    // Default: collapsed (unless we have a stored preference).
    const stored = readCollapsed(section_id)
    setCollapsed(stored ?? true, false)
  }
}

function setStatus(text: string): void {
  status_el.textContent = text
}

function setLightsStatus(text: string): void {
  lights_status_el.textContent = text
}

function setRenderStatus(text: string): void {
  render_status_el.textContent = text
}

function setLookStatus(text: string): void {
  look_status_el.textContent = text
}

function parseNumberInput(input: HTMLInputElement): number {
  return Number.parseFloat(input.value)
}

function setupRangeValueLabels(): void {
  const range_inputs = [...document.querySelectorAll<HTMLInputElement>('input[type="range"]')]

  for (const input of range_inputs) {
    const parent_label = input.closest('label')
    if (!parent_label) continue

    if (!parent_label.classList.contains('slider_label')) parent_label.classList.add('slider_label')

    // Extract label text from text nodes.
    let label_text = ''
    const to_remove: ChildNode[] = []
    for (const node of [...parent_label.childNodes]) {
      if (node.nodeType !== Node.TEXT_NODE) continue
      const text = node.textContent ?? ''
      if (text.trim().length === 0) {
        to_remove.push(node)
        continue
      }
      label_text += ` ${text.trim()}`
      to_remove.push(node)
    }

    for (const node of to_remove) parent_label.removeChild(node)

    // Ensure a name span exists before the input.
    let name_span = parent_label.querySelector<HTMLSpanElement>(':scope > span.slider_name')
    if (!name_span) {
      name_span = document.createElement('span')
      name_span.className = 'slider_name'
      name_span.textContent = label_text.trim() || input.id
      parent_label.insertBefore(name_span, input)
    }

    // Ensure a value span exists after the input.
    let value_span = parent_label.querySelector<HTMLSpanElement>(':scope > span.slider_value')
    if (!value_span) {
      value_span = document.createElement('span')
      value_span.className = 'slider_value'
      input.insertAdjacentElement('afterend', value_span)
    }

    const step_attr = input.getAttribute('step') ?? '1'
    const decimals = step_attr.includes('.') ? step_attr.split('.')[1]?.length ?? 0 : 0

    const updateValue = (): void => {
      const value = Number.parseFloat(input.value)
      value_span.textContent = Number.isFinite(value) ? value.toFixed(decimals) : input.value
    }

    input.addEventListener('input', updateValue)
    updateValue()
  }
}

const renderer = new THREE.WebGLRenderer({
  canvas: scene_canvas,
  antialias: true,
  alpha: true,
})
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.2
renderer.setSize(window.innerWidth, window.innerHeight, false)

const scene = new THREE.Scene()

// Simple environment/reflection approximation (helps match Sketchfab look without an HDRI).
const pmrem_generator = new THREE.PMREMGenerator(renderer)
pmrem_generator.compileEquirectangularShader()
const env_texture = pmrem_generator.fromScene(new RoomEnvironment(), 0.04).texture

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 2000)
camera.position.set(0, 0.7, 2.5)

// Camera debug locking.
// Used by:
// - "Debug home pose (freeze)" (strict deterministic baseline)
// - optionally when aligning world axes to model (static, head-on view)
let home_camera_lock_active = false
const saved_camera_position = new THREE.Vector3()
const saved_camera_quaternion = new THREE.Quaternion()
const saved_controls_target = new THREE.Vector3()
let saved_controls_enabled = true

const origin = new THREE.Vector3(0, 0, 0)
const home_camera_distance = 2.15

const tmp_camera_lock_target = new THREE.Vector3()
const tmp_camera_lock_forward = new THREE.Vector3()
const tmp_camera_lock_up = new THREE.Vector3()

const tmp_camera_forward = new THREE.Vector3()
const tmp_camera_approach_target = new THREE.Vector3()
const tmp_camera_approach_to_target = new THREE.Vector3()
const tmp_face_forward_world = new THREE.Vector3()
const tmp_move_dir = new THREE.Vector3()
const tmp_base_pos = new THREE.Vector3()

const controls = new OrbitControls(camera, scene_canvas)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.target.set(0, 0.15, 0)
controls.update()

const hemi_light = new THREE.HemisphereLight(0xaaccff, 0x0a0c1a, 0.6)
scene.add(hemi_light)

const dir_light = new THREE.DirectionalLight(0xffffff, 0.75)
dir_light.position.set(3, 5, 2)
scene.add(dir_light)

const ambient_light = new THREE.AmbientLight(0xffffff, 0.0)
scene.add(ambient_light)

// Lifts the underside without blowing out the top (acts like ground bounce).
const bounce_light = new THREE.PointLight(0xffffff, 0.0, 6, 2)
bounce_light.position.set(0, -0.6, 0.2)
scene.add(bounce_light)

// Talk spill lights (intensity driven by speech) are attached to the model after load so
// they move/rotate with the floating monitor.
// Use spotlights for the eye so we can aim them outward and avoid lighting the inner sphere in a way
// that reads like "imaginary" side reflections.
const talk_light_eye_front = new THREE.SpotLight(0x66ccff, 0.0, 1, Math.PI / 9, 0.4, 2)
const talk_light_eye_front_target = new THREE.Object3D()
talk_light_eye_front.target = talk_light_eye_front_target

const talk_light_eye_back = new THREE.SpotLight(0x66ccff, 0.0, 1, Math.PI / 9, 0.4, 2)
const talk_light_eye_back_target = new THREE.Object3D()
talk_light_eye_back.target = talk_light_eye_back_target

// LEDs are best represented as self-lit emissive surfaces, with a small *directional* spill.
// Use a spotlight so we can aim it outward and avoid washing the inner eye.
const talk_light_leds = new THREE.SpotLight(0x66ccff, 0.0, 1, Math.PI / 8, 0.35, 2)
const talk_light_leds_target = new THREE.Object3D()
// SpotLight requires its target to be in the scene graph.
talk_light_leds.target = talk_light_leds_target

const talk_light_booster = new THREE.PointLight(0x66ccff, 0.0, 6, 2)

// Conservative defaults; real placement is computed from material bounds after model load.
talk_light_eye_front.position.set(0, 0, 0.2)
talk_light_eye_front_target.position.set(0, 0, 0.35)

talk_light_eye_back.position.set(0, 0, -0.2)
talk_light_eye_back_target.position.set(0, 0, -0.35)

talk_light_leds.position.set(0, 0, 0)
talk_light_leds_target.position.set(0, 0, 0.2)

talk_light_booster.position.set(0, 0, 0)

const highlight_group = new THREE.Group()
scene.add(highlight_group)
let highlight_helpers: THREE.BoxHelper[] = []
let highlighted_material_uuid: string | null = null

const clock = new THREE.Clock()

// Debug helpers (makes it obvious if WebGL rendering is working even if the FBX fails to load)
const axes_helper = new THREE.AxesHelper(0.4)
const world_axes_base_position = new THREE.Vector3(0, 0, 0)
axes_helper.position.copy(world_axes_base_position)
scene.add(axes_helper)

// Simple ground reference.
const grid_floor = new THREE.GridHelper(8, 40, 0x274055, 0x162533)
grid_floor.position.set(0, -0.6, 0)
scene.add(grid_floor)

// Model-local debug helpers (attached to monitor_root after load).

const model_axes_helper = new THREE.AxesHelper(0.35)
model_axes_helper.visible = false

const model_forward_arrow_pos = new THREE.ArrowHelper(
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, 0),
  0.45,
  0xff00ff,
)
model_forward_arrow_pos.visible = false

const model_forward_arrow_neg = new THREE.ArrowHelper(
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 0, 0),
  0.45,
  0x00ffff,
)
model_forward_arrow_neg.visible = false

function makeOverlayMaterial(material: THREE.Material | THREE.Material[]): void {
  const mats = Array.isArray(material) ? material : [material]
  for (const mat of mats) {
    mat.depthTest = false
    mat.depthWrite = false

    // Keep overlay/debug colors stable under tone mapping.
    // (Not all materials use this, but it's safe to set when present.)
    ;(mat as unknown as { toneMapped?: boolean }).toneMapped = false
  }
}

// Make helpers visible even when they are inside the mesh.
const overlay_render_order = 999

model_axes_helper.renderOrder = overlay_render_order
model_axes_helper.frustumCulled = false
makeOverlayMaterial(model_axes_helper.material as THREE.Material | THREE.Material[])

for (const arrow of [model_forward_arrow_pos, model_forward_arrow_neg]) {
  // NOTE: renderOrder is per-object (children do not inherit), so apply to the arrow parts.
  arrow.line.renderOrder = overlay_render_order
  arrow.cone.renderOrder = overlay_render_order

  arrow.line.frustumCulled = false
  arrow.cone.frustumCulled = false

  makeOverlayMaterial(arrow.line.material as THREE.Material | THREE.Material[])
  makeOverlayMaterial(arrow.cone.material as THREE.Material | THREE.Material[])
}

let monitor_root: THREE.Group | null = null
let monitor_root_base_position: THREE.Vector3 | null = null
let monitor_root_base_quaternion: THREE.Quaternion | null = null

// "Face camera" calibration (computed after load from the eye core position).
let monitor_face_to_neg_z_quat: THREE.Quaternion | null = null
let monitor_face_forward_local: THREE.Vector3 | null = null

const neg_z_axis = new THREE.Vector3(0, 0, -1)
const world_up = new THREE.Vector3(0, 1, 0)

const tmp_mat_a = new THREE.Matrix4()
const tmp_quat_a = new THREE.Quaternion()
const tmp_quat_b = new THREE.Quaternion()
const tmp_quat_c = new THREE.Quaternion()
const tmp_quat_face_camera = new THREE.Quaternion()
const tmp_euler_a = new THREE.Euler()

// Look rotation offset (degrees 0..360).
// We build this using axis-angle quaternions (yaw/pitch/roll composition) to keep behavior simple.
const tmp_quat_look_rot = new THREE.Quaternion()
const tmp_quat_look_rot_x = new THREE.Quaternion()
const tmp_quat_look_rot_y = new THREE.Quaternion()
const tmp_quat_look_rot_z = new THREE.Quaternion()

const axis_x = new THREE.Vector3(1, 0, 0)
const axis_y = new THREE.Vector3(0, 1, 0)
const axis_z = new THREE.Vector3(0, 0, 1)

function wrapDeg180(deg_0_360: number): number {
  const d = ((deg_0_360 % 360) + 360) % 360
  return d > 180 ? d - 360 : d
}

function updateLookRotQuat(out: THREE.Quaternion): THREE.Quaternion {
  const x_deg = wrapDeg180(parseNumberInput(look_rot_x_deg_input))
  const y_deg = wrapDeg180(parseNumberInput(look_rot_y_deg_input))
  const z_deg = wrapDeg180(parseNumberInput(look_rot_z_deg_input))

  tmp_quat_look_rot_x.setFromAxisAngle(axis_x, THREE.MathUtils.degToRad(x_deg))
  tmp_quat_look_rot_y.setFromAxisAngle(axis_y, THREE.MathUtils.degToRad(y_deg))
  tmp_quat_look_rot_z.setFromAxisAngle(axis_z, THREE.MathUtils.degToRad(z_deg))

  // Apply Y then X then Z (yaw, pitch, roll).
  out.identity()
  out.multiply(tmp_quat_look_rot_y)
  out.multiply(tmp_quat_look_rot_x)
  out.multiply(tmp_quat_look_rot_z)
  return out
}

// Companion-style idle wander state.
let talk_needed_active = false
let attention_amount = 0
const wander_offset = new THREE.Vector3()
const wander_goal_offset = new THREE.Vector3()
let wander_next_goal_t = 0

// Persistent talk-time approach offset (in world space).
const talk_camera_approach_offset = new THREE.Vector3()

// Persistent talk-time facing offset (relative to base_quaternion * look_rot).
// This avoids snapping back to the original "home" direction after talking ends.
const talk_camera_face_offset_quat = new THREE.Quaternion()

// Approach timing state (seconds are in clock elapsed-time space).
let talk_camera_approach_end_t = 0
let talk_needed_was_active = false

let materials: material_with_emissive[] = []
let talk_targets: talk_target[] = []
let talk_material_uuid_set = new Set<string>()

let idle_bob_sampler: ReturnType<typeof createIdleBobSampler> | null = null
let aim_overlay_sampler: AnimationSampler | null = null
let halo_idle_enabled = true
let halo_aim_enabled = true
let idle_bob_amplitude = 0.04
let aim_overlay_blend = 0.3

type talk_motion_style = 'excited_hover' | 'spin_bursts' | 'orbit_swoop'

let talk_motion_active = false
let talk_motion_style: talk_motion_style = 'excited_hover'
let talk_motion_start_t = 0

let manual_preview_controls_enabled = false

let manual_preview_active = false
let manual_preview_start_t = 0
let manual_preview_end_t = 0
let manual_preview_forced_style: talk_motion_style | null = null

const manual_preview_default_duration_s = 2.0

// Talk-time camera-facing + approach tuning
const talk_attention_lambda = 4.0
const idle_attention_lambda = 2.8

// Target point is in front of the camera along its forward direction.
const talk_camera_approach_distance = 3.45

// Approach should take ~3s regardless of distance (with slight jitter so it isn't always identical).
const talk_camera_approach_duration_base_s = 3.0
const talk_camera_approach_duration_jitter_s = 0.35

// Slow down near target so it doesn't "snap" to a stop.
const talk_camera_approach_slow_distance = 0.9

// Safety cap to avoid extreme leaps if the camera/target jumps.
const talk_camera_approach_max_speed = 200.0
const talk_camera_approach_min_time_left_s = 0.35

// Steering toward the target prevents ending up offset left/right.
const talk_camera_approach_min_facing_dot = 0.05
const talk_camera_approach_steer_strength = 1.25

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function smoothstep(edge_0: number, edge_1: number, x: number): number {
  const t = clamp01((x - edge_0) / (edge_1 - edge_0))
  return t * t * (3 - 2 * t)
}

function dampNumber(current: number, target: number, lambda: number, dt_s: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt_s))
}


function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function easeInOutCubic(t: number): number {
  const x = clamp01(t)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

function updateManualPreviewButtons(): void {
  const now_t = clock.getElapsedTime()
  const is_active = manual_preview_active && now_t <= manual_preview_end_t

  preview_talk_button.disabled = !manual_preview_controls_enabled
  run_hover_button.disabled = !manual_preview_controls_enabled
  run_spin_button.disabled = !manual_preview_controls_enabled
  run_orbit_button.disabled = !manual_preview_controls_enabled

  stop_preview_button.disabled = !manual_preview_controls_enabled || !is_active
}

function stopManualPreview(): void {
  manual_preview_active = false
  manual_preview_end_t = 0
  manual_preview_forced_style = null

  talk_motion_active = false
  updateManualPreviewButtons()
}

function startManualPreview(manual_preview_options: { forced_style: talk_motion_style | null; duration_s?: number }): void {
  const now_t = clock.getElapsedTime()
  const duration_s = manual_preview_options.duration_s ?? manual_preview_default_duration_s

  manual_preview_active = true
  manual_preview_start_t = now_t
  manual_preview_end_t = now_t + Math.max(0.1, duration_s)
  manual_preview_forced_style = manual_preview_options.forced_style

  if (manual_preview_forced_style) {
    talk_motion_active = true
    talk_motion_style = manual_preview_forced_style
    talk_motion_start_t = now_t
  } else {
    talk_motion_active = false
  }

  updateManualPreviewButtons()
}

function getManualPreviewProgress(now_t: number): number | null {
  if (!manual_preview_active) return null
  if (now_t > manual_preview_end_t) {
    stopManualPreview()
    return null
  }

  const duration_s = Math.max(0.001, manual_preview_end_t - manual_preview_start_t)
  return clamp01((now_t - manual_preview_start_t) / duration_s)
}

function getManualPreviewTalkStrength(now_t: number): number | null {
  const p = getManualPreviewProgress(now_t)
  if (p === null) return null

  // Smooth fade-in/out so the preview doesn't pop.
  const fade_in = smoothstep(0, 0.12, p)
  const fade_out = 1 - smoothstep(0.88, 1, p)
  const fade = Math.max(0, Math.min(fade_in, fade_out))

  // Pseudo-speech envelope (deterministic): mix a few frequencies and shape to feel syllable-like.
  const a = 0.5 + 0.5 * Math.sin(now_t * 11.3)
  const b = 0.5 + 0.5 * Math.sin(now_t * 7.1 + 0.8)
  const c = 0.5 + 0.5 * Math.sin(now_t * 3.2 + 1.7)

  const syllable = Math.pow(0.55 * a + 0.35 * b + 0.10 * c, 2.2)
  const strength = clamp01(0.15 + 0.85 * syllable)

  return strength * fade
}

function clampAbs(value: number, max_abs: number): number {
  return Math.max(-max_abs, Math.min(max_abs, value))
}

// Sketchfab has multiple materials involved in the "eye":
// - EyeMaterial: outer lens/shell (albedo: monitor4UV.png)
// - InnerEyeMaterial: inner detail (albedo: internallight.png)
// - InnerSphereMaterial: glowing core (albedo: SphereFinal.png + high emissive)
let eye_shell_material: material_with_emissive | null = null
let inner_eye_material: material_with_emissive | null = null
let eye_core_material: material_with_emissive | null = null

function ensureEyeCoreNoEnvReflections(): void {
  if (!eye_core_material) return
  if (!(eye_core_material instanceof THREE.MeshPhongMaterial)) return

  const mat = eye_core_material
  let changed = false

  // If we previously forced emissive-only, restore a reasonable baseline so the core can still be lit
  // by actual light sources.
  if (!mat.map && mat.emissiveMap) {
    mat.map = mat.emissiveMap
    changed = true
  }

  if (mat.color.getHex() === 0x000000) {
    mat.color.setHex(0xffffff)
    changed = true
  }

  const baseline = phong_baseline_by_uuid.get(mat.uuid)
  if (baseline) {
    if (mat.shininess === 0 && baseline.shininess !== 0) {
      mat.shininess = baseline.shininess
      changed = true
    }

    if (mat.specular.getHex() === 0x000000 && baseline.specular_hex !== 0x000000) {
      mat.specular.setHex(baseline.specular_hex)
      changed = true
    }
  }

  // Prevent the "imaginary" side reflections from IBL/env maps; keep reflections only from real lights.
  if (mat.envMap !== null) {
    mat.envMap = null
    changed = true
  }

  if (mat.reflectivity !== 0) {
    mat.reflectivity = 0
    changed = true
  }

  // Double-sided lighting can look wrong on a sphere.
  if (mat.side !== THREE.FrontSide) {
    mat.side = THREE.FrontSide
    changed = true
  }

  if (changed) mat.needsUpdate = true
}

// Some materials don't reliably bring their maps across via FBXLoader; bind them manually to match Sketchfab.
let leds_material: material_with_emissive | null = null
let booster_material: material_with_emissive | null = null

// Eye color slider blends between a more cyan and a deeper Halo-blue.
const eye_cyan_color = new THREE.Color(0x00a6ff)
const eye_halo_blue_color = new THREE.Color(0x0066ff)
const eye_color_tmp = new THREE.Color()

function computeEyeGlowColor(out: THREE.Color): THREE.Color {
  const deepness = parseNumberInput(eye_blue_deepness_input)
  out.lerpColors(eye_cyan_color, eye_halo_blue_color, deepness)
  return out
}

const material_baseline_by_uuid = new Map<string, material_baseline>()
const material_meshes_by_uuid = new Map<string, THREE.Mesh[]>()

type material_bounds_root = {
  box_root: THREE.Box3
  center_root: THREE.Vector3
  size_root: THREE.Vector3
}

const tmp_bounds_corner_local = new THREE.Vector3()
const tmp_bounds_corner_world = new THREE.Vector3()
const tmp_bounds_corner_root = new THREE.Vector3()

function computeMaterialBoundsInRoot(root: THREE.Object3D, material_uuid: string): material_bounds_root | null {
  const meshes = material_meshes_by_uuid.get(material_uuid)
  if (!meshes || meshes.length === 0) return null

  root.updateMatrixWorld(true)

  const box_root = new THREE.Box3()
  let did_expand = false

  for (const mesh of meshes) {
    const geometry = mesh.geometry
    geometry.computeBoundingBox()
    const bb = geometry.boundingBox
    if (!bb) continue

    // Expand by the 8 corners of the geometry bbox, transformed to world then into root-local.
    const min = bb.min
    const max = bb.max

    const corners: Array<[number, number, number]> = [
      [min.x, min.y, min.z],
      [min.x, min.y, max.z],
      [min.x, max.y, min.z],
      [min.x, max.y, max.z],
      [max.x, min.y, min.z],
      [max.x, min.y, max.z],
      [max.x, max.y, min.z],
      [max.x, max.y, max.z],
    ]

    for (const [x, y, z] of corners) {
      tmp_bounds_corner_local.set(x, y, z)

      tmp_bounds_corner_world.copy(tmp_bounds_corner_local).applyMatrix4(mesh.matrixWorld)

      tmp_bounds_corner_root.copy(tmp_bounds_corner_world)
      root.worldToLocal(tmp_bounds_corner_root)

      box_root.expandByPoint(tmp_bounds_corner_root)
      did_expand = true
    }
  }

  if (!did_expand) return null

  const center_root = box_root.getCenter(new THREE.Vector3())
  const size_root = box_root.getSize(new THREE.Vector3())

  return { box_root, center_root, size_root }
}

type phong_baseline = {
  shininess: number
  specular_hex: number
  reflectivity: number
  has_env_map: boolean
}

const phong_baseline_by_uuid = new Map<string, phong_baseline>()

function getMaterials(material: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(material) ? material : [material]
}

function markTextureAsSrgb(texture: THREE.Texture | null | undefined): void {
  if (!texture) return
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
}

function configureColorTexture(texture: THREE.Texture | null | undefined): void {
  if (!texture) return

  // Match Sketchfab defaults (most of these textures are authored as color data).
  markTextureAsSrgb(texture)

  // Sketchfab materials in this model use REPEAT wrapping.
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.needsUpdate = true
}

function fixMaterialColorSpaces(mat: material_with_emissive): void {
  // FBXLoader often leaves color maps as linear, which makes them look washed out.
  // Mark color textures as sRGB so the renderer decodes them correctly.
  configureColorTexture(mat.map)
  configureColorTexture(mat.emissiveMap)
}

function textureBasename(tex: THREE.Texture | null | undefined): string | null {
  const src = (tex && (tex.image as { src?: string } | undefined)?.src) || ''
  const base = src.split('/').pop() || ''
  return base.length > 0 ? base : null
}

const texture_cache_by_basename = new Map<string, THREE.Texture>()
const emissive_mask_cache_by_src_uuid = new Map<string, THREE.Texture>()

type bind_texture_opts = {
  force?: boolean
  set_emissive_map?: boolean
  on_applied?: (tex: THREE.Texture) => void
}

function bindColorTexture(
  mat: material_with_emissive,
  basename: string,
  opts?: bind_texture_opts,
): void {
  const current_basename = textureBasename(mat.map)?.toLowerCase() ?? ''
  const desired_key = basename.toLowerCase()
  const should_rebind = Boolean(opts?.force) || current_basename !== desired_key

  const applyTexture = (tex: THREE.Texture): void => {
    configureColorTexture(tex)

    mat.map = tex
    if (opts?.set_emissive_map) mat.emissiveMap = tex

    fixMaterialColorSpaces(mat)
    mat.needsUpdate = true

    opts?.on_applied?.(tex)
  }

  if (!should_rebind) {
    // Still ensure emissiveMap matches map when we depend on it for preserving detail under emissive.
    if (opts?.set_emissive_map && mat.map && mat.emissiveMap !== mat.map) {
      mat.emissiveMap = mat.map
      fixMaterialColorSpaces(mat)
      mat.needsUpdate = true
    }
    return
  }

  const cached = texture_cache_by_basename.get(desired_key)
  if (cached) {
    applyTexture(cached)
    return
  }

  const loader = new THREE.TextureLoader()
  const url = `${textures_base_url}${basename}`
  loader.load(
    url,
    (tex) => {
      texture_cache_by_basename.set(desired_key, tex)
      applyTexture(tex)
    },
    undefined,
    () => {
      setStatus(`Texture bind failed (could not load ${basename}).`)
    },
  )
}

function getTextureImageSize(image: unknown): { width: number; height: number } | null {
  if (!image) return null

  const any_img = image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number }

  const w = any_img.naturalWidth ?? any_img.width
  const h = any_img.naturalHeight ?? any_img.height

  if (typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0) return { width: w, height: h }
  return null
}

function setNonColorTextureSpace(texture: THREE.Texture): void {
  const any_tex = texture as unknown as { colorSpace?: unknown }
  if (!('colorSpace' in any_tex)) return

  const any_three = THREE as unknown as { NoColorSpace?: unknown }
  any_tex.colorSpace = any_three.NoColorSpace
}

function copyTextureUvTransform(dst: THREE.Texture, src: THREE.Texture): void {
  dst.offset.copy(src.offset)
  dst.repeat.copy(src.repeat)
  dst.center.copy(src.center)
  dst.rotation = src.rotation

  // Newer three builds support per-texture uv channels.
  const any_src = src as unknown as { channel?: unknown }
  const any_dst = dst as unknown as { channel?: unknown }
  if (typeof any_src.channel === 'number') any_dst.channel = any_src.channel

  dst.flipY = src.flipY
}

function createLedEmissiveMaskFromTexture(src: THREE.Texture): THREE.Texture | null {
  const cached = emissive_mask_cache_by_src_uuid.get(src.uuid)
  if (cached) return cached

  const image = (src as { image?: unknown }).image
  const size = getTextureImageSize(image)
  if (!size) return null

  // Bottom LED details are small in the atlas; keep more resolution so the mask doesn't alias.
  const mask_max_dim = 1024
  const scale = Math.min(1, mask_max_dim / Math.max(size.width, size.height))
  const dst_w = Math.max(1, Math.round(size.width * scale))
  const dst_h = Math.max(1, Math.round(size.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = dst_w
  canvas.height = dst_h

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  // Preserve tiny atlas details.
  ctx.imageSmoothingEnabled = false

  // Draw scaled; this keeps CPU work bounded even if the source is very large.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx.drawImage(image as any, 0, 0, dst_w, dst_h)

  const img_data = ctx.getImageData(0, 0, dst_w, dst_h)
  const src_data = img_data.data

  const out = new Uint8Array(dst_w * dst_h * 4)

  // Heuristic: treat pixels as "LED" when they are cyan/blue (high G+B relative to R) and bright enough.
  for (let i = 0, o = 0; i < src_data.length; i += 4, o += 4) {
    const r = src_data[i]!
    const g = src_data[i + 1]!
    const b = src_data[i + 2]!

    const brightness = (r + g + b) / (3 * 255)
    const gb = (g + b) * 0.5
    const led_score = (gb - r) / 255

    // Thresholds tuned to keep non-LED grey panels from glowing.
    const t0 = 0.10
    const t1 = 0.35
    const s = Math.min(1, Math.max(0, (led_score - t0) / (t1 - t0)))

    const b0 = 0.20
    const b1 = 0.80
    const bs = Math.min(1, Math.max(0, (brightness - b0) / (b1 - b0)))

    const m = Math.round(255 * s * bs)

    out[o] = m
    out[o + 1] = m
    out[o + 2] = m
    out[o + 3] = 255
  }

  const tex = new THREE.DataTexture(out, dst_w, dst_h, THREE.RGBAFormat)
  tex.needsUpdate = true

  // This is non-color data.
  setNonColorTextureSpace(tex)

  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true

  copyTextureUvTransform(tex, src)

  emissive_mask_cache_by_src_uuid.set(src.uuid, tex)
  return tex
}

function ensureLedsEmissiveMaskBound(): void {
  if (!leds_material) return
  if (!leds_material.map) return

  const mask = createLedEmissiveMaskFromTexture(leds_material.map)
  if (!mask) return

  leds_material.emissiveMap = mask

  // Ensure UV transforms match the albedo.
  copyTextureUvTransform(mask, leds_material.map)

  leds_material.needsUpdate = true
}

function ensureSketchfabTexturesBound(force_rebind: boolean = false): void {
  // Match Sketchfab material/texture expectations where FBX exports are incomplete.

  // Eye
  // Bind emissiveMap so talk-driven emissive preserves texture detail on these surfaces.
  if (eye_shell_material) bindColorTexture(eye_shell_material, 'monitor4UV.png', { force: force_rebind, set_emissive_map: true })
  if (inner_eye_material) bindColorTexture(inner_eye_material, 'internallight.png', { force: force_rebind, set_emissive_map: true })

  // Preserve texture detail on the emissive/glowing core.
  if (eye_core_material) {
    bindColorTexture(eye_core_material, 'SphereFinal.png', { force: force_rebind, set_emissive_map: true })

    // Keep it responsive to real lights, but prevent env/IBL reflections.
    ensureEyeCoreNoEnvReflections()
  }

  // LEDS (Sketchfab uses monitor4UV.png for this material)
  // Use an emissive mask derived from the albedo so only the blue/cyan LED pixels glow.
  if (leds_material) {
    bindColorTexture(leds_material, 'monitor4UV.png', {
      force: force_rebind,
      on_applied: () => ensureLedsEmissiveMaskBound(),
    })

    // Important: if the map already matches, bindColorTexture will no-op. We still need the emissive mask.
    ensureLedsEmissiveMaskBound()
  }

  // BoosterMaterial (Sketchfab uses SphereFinal.png for this material)
  if (booster_material) bindColorTexture(booster_material, 'SphereFinal.png', { force: force_rebind })
}

function capturePhongBaseline(mat: THREE.MeshPhongMaterial): void {
  if (phong_baseline_by_uuid.has(mat.uuid)) return

  phong_baseline_by_uuid.set(mat.uuid, {
    shininess: mat.shininess,
    specular_hex: mat.specular.getHex(),
    reflectivity: mat.reflectivity,
    has_env_map: Boolean(mat.envMap),
  })
}

function applyPhongLookControls(mat: THREE.MeshPhongMaterial): void {
  const baseline = phong_baseline_by_uuid.get(mat.uuid)
  if (!baseline) return

  const shininess = parseNumberInput(phong_shininess_input)
  const specular_strength = parseNumberInput(phong_specular_input)
  const reflectivity = parseNumberInput(env_reflectivity_input)
  const env_enabled = enable_env_input.checked

  mat.shininess = shininess
  mat.specular.setHex(baseline.specular_hex).multiplyScalar(specular_strength)

  // Env reflections
  mat.reflectivity = env_enabled ? reflectivity : 0
  const next_env = env_enabled ? env_texture : null
  if (mat.envMap !== next_env) {
    mat.envMap = next_env
    mat.needsUpdate = true
  }
}

function guessDefaultMaterial(materials_list: material_with_emissive[]): material_with_emissive | null {
  const candidates = materials_list.filter((m) => {
    const name = (m.name ?? '').toLowerCase()
    const map_src = (m.map && (m.map.image as { src?: string } | undefined)?.src) || ''
    const map_src_lower = map_src.toLowerCase()

    return (
      name.includes('sphere') ||
      name.includes('light') ||
      name.includes('eye') ||
      name.includes('led') ||
      map_src_lower.includes('spherefinal') ||
      map_src_lower.includes('internallight')
    )
  })

  if (candidates.length > 0) return candidates[0]
  if (materials_list.length > 0) return materials_list[0]
  return null
}

function isRecommendedTalkMaterial(mat: material_with_emissive): boolean {
  const name = (mat.name ?? '').toLowerCase()
  return (
    name.includes('eye') ||
    name.includes('led') ||
    name.includes('innersphere') ||
    name.includes('innereye') ||
    name.includes('innerrings')
  )
}

function isEyeShellMaterial(mat: material_with_emissive): boolean {
  return (mat.name ?? '').toLowerCase() === 'eyematerial'
}

function isInnerEyeMaterial(mat: material_with_emissive): boolean {
  return (mat.name ?? '').toLowerCase() === 'innereyematerial'
}

function isEyeCoreMaterial(mat: material_with_emissive): boolean {
  return (mat.name ?? '').toLowerCase() === 'innerspherematerial'
}

function talkWeightForMaterial(mat: material_with_emissive): number {
  const name = (mat.name ?? '').toLowerCase()

  if (name.includes('eye')) return 2.2
  if (name.includes('led')) return 1.8
  if (name.includes('innersphere')) return 1.6
  if (name.includes('innereye')) return 1.6
  if (name.includes('innerrings')) return 1.3

  return 1
}

function clearHighlight(): void {
  highlighted_material_uuid = null
  for (const helper of highlight_helpers) highlight_group.remove(helper)
  highlight_helpers = []
}

function setHighlight(material_uuid: string): void {
  if (highlighted_material_uuid === material_uuid) return

  clearHighlight()
  highlighted_material_uuid = material_uuid

  const meshes = material_meshes_by_uuid.get(material_uuid) ?? []
  for (const mesh of meshes) {
    const helper = new THREE.BoxHelper(mesh, 0xfff19c)
    const mat = helper.material as THREE.LineBasicMaterial
    mat.transparent = true
    mat.opacity = 0.9
    highlight_group.add(helper)
    highlight_helpers.push(helper)
  }
}

function rebuildTalkTargets(): void {
  talk_targets = []

  // Restore all materials to their baseline first so toggling checkboxes has an immediate visible effect.
  for (const mat of materials) {
    const baseline = material_baseline_by_uuid.get(mat.uuid)
    if (!baseline) continue

    if (!mat.emissive) mat.emissive = new THREE.Color(baseline.emissive_hex)
    else mat.emissive.setHex(baseline.emissive_hex)

    mat.emissiveIntensity = baseline.emissive_intensity
  }

  for (const mat of materials) {
    if (!talk_material_uuid_set.has(mat.uuid)) continue

    const base_intensity = material_baseline_by_uuid.get(mat.uuid)?.emissive_intensity ?? 0
    talk_targets.push({
      material: mat,
      base_emissive_intensity: base_intensity,
      talk_weight: talkWeightForMaterial(mat),
    })

    if (!mat.emissive) mat.emissive = new THREE.Color(0x66ccff)
  }
}

function renderTalkMaterialsUi(): void {
  talk_materials_list.innerHTML = ''

  for (const mat of materials) {
    const row = document.createElement('label')
    row.className = 'talk_material_row'

    row.addEventListener('mouseenter', () => setHighlight(mat.uuid))
    row.addEventListener('mouseleave', () => {
      if (highlighted_material_uuid === mat.uuid) clearHighlight()
    })

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = talk_material_uuid_set.has(mat.uuid)
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) talk_material_uuid_set.add(mat.uuid)
      else talk_material_uuid_set.delete(mat.uuid)
      rebuildTalkTargets()
    })

    const text = document.createElement('span')
    text.textContent = `${mat.name || '(unnamed)'} — ${mat.type}`

    row.appendChild(checkbox)
    row.appendChild(text)

    talk_materials_list.appendChild(row)
  }
}

function selectRecommendedTalkMaterials(): void {
  talk_material_uuid_set = new Set<string>()

  // Preferred defaults (per Joey): booster, eye shell, inner eye, and LEDs.
  const preferred_names = new Set<string>([
    'boostermaterial',
    'eyematerial',
    'innereyematerial',
    'leds',
  ])

  for (const mat of materials) {
    const name = (mat.name ?? '').toLowerCase()
    if (preferred_names.has(name)) talk_material_uuid_set.add(mat.uuid)
  }

  // Fallback to heuristic selection if names don't match for some export.
  if (talk_material_uuid_set.size === 0) {
    for (const mat of materials) {
      if (isRecommendedTalkMaterial(mat)) talk_material_uuid_set.add(mat.uuid)
    }
  }

  if (talk_material_uuid_set.size === 0) {
    const fallback = guessDefaultMaterial(materials)
    if (fallback) talk_material_uuid_set.add(fallback.uuid)
  }

  renderTalkMaterialsUi()
  rebuildTalkTargets()
}

const manager = new THREE.LoadingManager()
manager.setURLModifier((url: string) => {
  // FBX contains Windows paths; remap to our public textures directory by basename.
  const basename = url.split(/[/\\]/).pop() || url
  if (basename.toLowerCase().endsWith('.png')) return `${textures_base_url}${basename}`
  return url
})

const fbx_loader = new FBXLoader(manager)
fbx_loader.load(
  model_url,
  (object) => {
    const monitor_model = object

    // Wrapper root with a centered pivot.
    monitor_root = new THREE.Group()
    monitor_root.add(monitor_model)

    // Keep the model's authored orientation by default (no extra rotations).

    let mesh_count = 0
    const material_by_uuid = new Map<string, material_with_emissive>()

    monitor_model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      mesh_count++

      child.castShadow = false
      child.receiveShadow = false

      for (const mat of getMaterials(child.material)) {
        const typed = mat as material_with_emissive

        // Sketchfab lists cullFace=DISABLE for these materials; treat as double-sided for closer parity.
        typed.side = THREE.DoubleSide
        typed.needsUpdate = true

        fixMaterialColorSpaces(typed)
        if (typed instanceof THREE.MeshPhongMaterial) capturePhongBaseline(typed)

        if (!material_by_uuid.has(typed.uuid)) material_by_uuid.set(typed.uuid, typed)

        const meshes = material_meshes_by_uuid.get(typed.uuid) ?? []
        meshes.push(child)
        material_meshes_by_uuid.set(typed.uuid, meshes)
      }
    })

    materials = [...material_by_uuid.values()].sort((a, b) => {
      const an = a.name ?? ''
      const bn = b.name ?? ''
      return an.localeCompare(bn)
    })

    // Capture baselines for restore when toggling talk materials.
    eye_shell_material = null
    inner_eye_material = null
    eye_core_material = null
    leds_material = null
    booster_material = null
    material_baseline_by_uuid.clear()
    for (const mat of materials) {
      const is_eye_shell = isEyeShellMaterial(mat)
      const is_inner_eye = isInnerEyeMaterial(mat)
      const is_eye_core = isEyeCoreMaterial(mat)

      if (is_eye_shell) eye_shell_material = mat
      if (is_inner_eye) inner_eye_material = mat
      if (is_eye_core) eye_core_material = mat
      if ((mat.name ?? '').toLowerCase() === 'leds') leds_material = mat
      if ((mat.name ?? '').toLowerCase() === 'boostermaterial') booster_material = mat

      // Baselines are used when talk materials are unchecked.
      // For the eye core, default baseline to "off" so unchecking everything truly disables glow.
      const emissive_intensity = is_eye_core ? 0 : (typeof mat.emissiveIntensity === 'number' ? mat.emissiveIntensity : 0)
      const emissive_hex = is_eye_core ? 0x000000 : (mat.emissive ? mat.emissive.getHex() : 0x000000)
      material_baseline_by_uuid.set(mat.uuid, { emissive_intensity, emissive_hex })
    }

    // Texture setup (eye, LEDs, etc)
    ensureSketchfabTexturesBound()

    select_recommended_button.disabled = false
    selectRecommendedTalkMaterials()

    manual_preview_controls_enabled = true
    updateManualPreviewButtons()

    const box = new THREE.Box3().setFromObject(monitor_model)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())

    const max_dim = Math.max(size.x, size.y, size.z)
    const desired_size = 1.1
    const scale = max_dim > 0 ? desired_size / max_dim : 1

    // Place the grid just under the model.
    grid_floor.position.y = -size.y * scale * 0.5 - 0.05

    // Important: FBX units are huge. Scale the model down to fit the view.
    monitor_model.scale.setScalar(scale)

    // Center the model *inside the wrapper root* so the wrapper's origin is the model center.
    monitor_model.position.set(-center.x * scale, -center.y * scale, -center.z * scale)

    // Attach and position talk spill lights based on actual material bounds.
    for (const light of [
      talk_light_eye_front,
      talk_light_eye_back,
      talk_light_leds,
      talk_light_booster,
    ]) {
      light.visible = true
      light.intensity = 0
      if (light.parent) light.parent.remove(light)
      monitor_root.add(light)
    }

    // Ensure spot targets are parented too.
    for (const target of [
      talk_light_eye_front_target,
      talk_light_eye_back_target,
      talk_light_leds_target,
    ]) {
      if (target.parent) target.parent.remove(target)
      monitor_root.add(target)
    }

    // Model debug helpers.
    if (model_axes_helper.parent) model_axes_helper.parent.remove(model_axes_helper)
    if (model_forward_arrow_pos.parent) model_forward_arrow_pos.parent.remove(model_forward_arrow_pos)
    if (model_forward_arrow_neg.parent) model_forward_arrow_neg.parent.remove(model_forward_arrow_neg)
    monitor_root.add(model_axes_helper)
    monitor_root.add(model_forward_arrow_pos)
    monitor_root.add(model_forward_arrow_neg)

    // Place helpers slightly above center so they don't get lost inside the geometry.
    model_axes_helper.position.set(0, 0.05, 0)
    model_forward_arrow_pos.position.set(0, 0.05, 0)
    model_forward_arrow_neg.position.set(0, 0.05, 0)


    monitor_root.updateMatrixWorld(true)

    // Eye front/back are derived from the eye core material bounds.
    // We also use the eye core's center offset from the model root origin as a proxy for "face" direction.
    // (This is more intuitive than using the model's raw +Z axis, since the imported FBX axes may not align
    // to what humans perceive as "forward" when looking at the eye.)
    if (eye_core_material) {
      const bounds = computeMaterialBoundsInRoot(monitor_root, eye_core_material.uuid)
      if (bounds) {
        // Face direction: from model center (root origin) toward the eye core center.
        // Flatten Y to keep the indicator stable (primarily yaw), since the monitor is roughly symmetric.
        const face_dir = bounds.center_root.clone()
        face_dir.y = 0
        if (face_dir.lengthSq() > 0.000001) {
          // Empirically, the imported FBX's perceived “face” direction is opposite the eye core center offset.
          // Invert so the magenta arrow points toward the eye.
          face_dir.normalize().negate()

          model_forward_arrow_pos.setDirection(face_dir)
          model_forward_arrow_neg.setDirection(face_dir.clone().negate())

          // Store "face forward" in the model's local space (root space).
          monitor_face_forward_local = face_dir.clone()

          // Build a correction quaternion so we can use Object3D lookAt (-Z toward target)
          // while treating `face_dir` as the model's true forward.
          monitor_face_to_neg_z_quat = monitor_face_to_neg_z_quat ?? new THREE.Quaternion()
          monitor_face_to_neg_z_quat.setFromUnitVectors(face_dir, neg_z_axis)
        }

        const depth = bounds.size_root.z
        const z_margin = Math.max(0.02, depth * 0.18)
        const dist = Math.max(0.2, bounds.size_root.length() * 0.9)

        const front_pos = new THREE.Vector3(
          bounds.center_root.x,
          bounds.center_root.y,
          bounds.box_root.max.z + z_margin,
        )

        const back_pos = new THREE.Vector3(
          bounds.center_root.x,
          bounds.center_root.y,
          bounds.box_root.min.z - z_margin,
        )

        const front_dir = front_pos.clone().sub(bounds.center_root).normalize()
        const back_dir = back_pos.clone().sub(bounds.center_root).normalize()

        talk_light_eye_front.position.copy(front_pos)
        talk_light_eye_front_target.position.copy(front_pos).addScaledVector(front_dir, Math.max(0.15, dist * 0.6))
        talk_light_eye_front.distance = dist

        talk_light_eye_back.position.copy(back_pos)
        talk_light_eye_back_target.position.copy(back_pos).addScaledVector(back_dir, Math.max(0.15, dist * 0.6))
        talk_light_eye_back.distance = dist
      }
    }

    if (leds_material) {
      const bounds = computeMaterialBoundsInRoot(monitor_root, leds_material.uuid)
      if (bounds) {
        // Aim LED spill outward so it doesn't light the inner eye.
        const outward = bounds.center_root.clone().normalize()
        const outward_ok = Number.isFinite(outward.x) && Number.isFinite(outward.y) && Number.isFinite(outward.z)

        const offset = Math.max(0.03, bounds.size_root.length() * 0.12)
        const target_offset = offset + Math.max(0.06, bounds.size_root.length() * 0.35)

        if (outward_ok && outward.lengthSq() > 0.000001) {
          talk_light_leds.position.copy(bounds.center_root).addScaledVector(outward, offset)
          talk_light_leds_target.position.copy(bounds.center_root).addScaledVector(outward, target_offset)
        } else {
          talk_light_leds.position.copy(bounds.center_root)
          talk_light_leds_target.position.copy(bounds.center_root)
          talk_light_leds_target.position.z += Math.max(0.15, bounds.size_root.length() * 0.35)
        }

        talk_light_leds.distance = Math.max(0.15, bounds.size_root.length() * 0.9)
      }
    }

    if (booster_material) {
      const bounds = computeMaterialBoundsInRoot(monitor_root, booster_material.uuid)
      if (bounds) talk_light_booster.position.copy(bounds.center_root)
    }

    // Place bounce light under the model.
    if (monitor_root) {
      monitor_root.updateMatrixWorld(true)
      const box_after = new THREE.Box3().setFromObject(monitor_root)
      const size_after = box_after.getSize(new THREE.Vector3())
      bounce_light.position.set(0, box_after.min.y - Math.max(0.12, size_after.y * 0.12), 0.1)
    }

    scene.add(monitor_root)

    // Capture base transform after centering/scale; animations are applied as offsets from this.
    monitor_root_base_position = new THREE.Vector3(0, 0, 0)
    monitor_root.position.copy(monitor_root_base_position)

    monitor_root_base_quaternion = monitor_root.quaternion.clone()

    setStatus(
      `Model loaded (meshes: ${mesh_count}, materials: ${materials.length}, size: ${size.x.toFixed(2)},${size.y.toFixed(2)},${size.z.toFixed(2)}). Audio glow will animate whenever audio is playing.`,
    )
    start_button.disabled = false

    fetch('/animations/idle.jmm')
      .then(r => r.text())
      .then(text => {
        const anim = parseJma(text)
        idle_bob_sampler = createIdleBobSampler(anim)
      })
      .catch(err => {
        console.warn('Failed to load idle animation, using procedural fallback:', err)
      })

    fetch('/animations/aim_still_up.jmo')
      .then(r => r.text())
      .then(text => {
        const anim = parseJma(text)
        aim_overlay_sampler = new AnimationSampler(anim, 'monitor', { loop: true })
      })
      .catch(err => {
        console.warn('Failed to load aim overlay, camera-facing only:', err)
      })

    start_record_button.disabled = false

    if (should_attempt_autostart && audio_el.src) {
      // Likely still blocked by autoplay policies unless a user gesture occurred.
      start_button.click()
    }
  },
  (ev) => {
    if (!ev.total) return
    const percent = Math.round((ev.loaded / ev.total) * 100)
    setStatus(`Loading model… ${percent}%`)
  },
  (err) => {
    console.error(err)
    setStatus('Failed to load model. See console for details.')
  },
)

select_recommended_button.addEventListener('click', () => {
  selectRecommendedTalkMaterials()
})

reset_look_rot_button.addEventListener('click', () => {
  look_rot_x_deg_input.value = String(default_look_rot_x_deg)
  look_rot_y_deg_input.value = String(default_look_rot_y_deg)
  look_rot_z_deg_input.value = String(default_look_rot_z_deg)

  // Reset talk-time offsets so the calibration reset is truly deterministic.
  talk_camera_face_offset_quat.identity()
  talk_camera_approach_offset.set(0, 0, 0)

  // Update slider readouts immediately.
  look_rot_x_deg_input.dispatchEvent(new Event('input'))
  look_rot_y_deg_input.dispatchEvent(new Event('input'))
  look_rot_z_deg_input.dispatchEvent(new Event('input'))
})

reset_model_pose_button.addEventListener('click', () => {
  model_pos_x_input.value = '0'
  model_pos_y_input.value = '0'
  model_pos_z_input.value = '0'

  look_rot_x_deg_input.value = String(default_look_rot_x_deg)
  look_rot_y_deg_input.value = String(default_look_rot_y_deg)
  look_rot_z_deg_input.value = String(default_look_rot_z_deg)

  // Reset talk-time offsets so the calibration reset is truly deterministic.
  talk_camera_face_offset_quat.identity()
  talk_camera_approach_offset.set(0, 0, 0)

  model_pos_x_input.dispatchEvent(new Event('input'))
  model_pos_y_input.dispatchEvent(new Event('input'))
  model_pos_z_input.dispatchEvent(new Event('input'))

  look_rot_x_deg_input.dispatchEvent(new Event('input'))
  look_rot_y_deg_input.dispatchEvent(new Event('input'))
  look_rot_z_deg_input.dispatchEvent(new Event('input'))
})

preview_talk_button.addEventListener('click', () => {
  startManualPreview({ forced_style: null })
})

stop_preview_button.addEventListener('click', () => {
  stopManualPreview()
})

run_hover_button.addEventListener('click', () => {
  startManualPreview({ forced_style: 'excited_hover' })
})

run_spin_button.addEventListener('click', () => {
  startManualPreview({ forced_style: 'spin_bursts' })
})

run_orbit_button.addEventListener('click', () => {
  startManualPreview({ forced_style: 'orbit_swoop' })
})

// --- Audio + analysis ---
let audio_ctx: AudioContext | null = null
let analyser_node: AnalyserNode | null = null
let audio_source_node: MediaElementAudioSourceNode | null = null
let audio_stream_dest: MediaStreamAudioDestinationNode | null = null
let time_domain_buffer: Float32Array<ArrayBuffer> | null = null

let talk_strength_smoothed = 0

function ensureAudioGraph(): void {
  if (audio_ctx && analyser_node && audio_source_node && audio_stream_dest && time_domain_buffer) return

  audio_ctx = new AudioContext()
  analyser_node = audio_ctx.createAnalyser()
  analyser_node.fftSize = 2048
  analyser_node.smoothingTimeConstant = 0

  // Use an ArrayBuffer-backed typed array to satisfy WebAudio type signatures.
  time_domain_buffer = new Float32Array(
    new ArrayBuffer(analyser_node.fftSize * Float32Array.BYTES_PER_ELEMENT),
  )

  audio_stream_dest = audio_ctx.createMediaStreamDestination()

  // Must only create ONE MediaElementSource per <audio> element.
  audio_source_node = audio_ctx.createMediaElementSource(audio_el)
  audio_source_node.connect(analyser_node)
  audio_source_node.connect(audio_ctx.destination)
  audio_source_node.connect(audio_stream_dest)
}

function computeRms(analyser: AnalyserNode, buffer: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buffer)
  let sum_sq = 0
  for (let i = 0; i < buffer.length; i++) sum_sq += buffer[i] * buffer[i]
  return Math.sqrt(sum_sq / buffer.length)
}

function shapeTalkStrength(rms: number): number {
  const noise_gate = parseNumberInput(noise_gate_input)
  const talk_gain = parseNumberInput(talk_gain_input)
  const curve = parseNumberInput(talk_curve_input)

  const gated = Math.max(0, rms - noise_gate)
  const gained = Math.min(1, gated * talk_gain)
  const curved = Math.pow(gained, curve)

  return Math.min(1, Math.max(0, curved))
}

function smoothTalkStrength(target: number): number {
  const attack = parseNumberInput(attack_input)
  const release = parseNumberInput(release_input)

  const lerp = target > talk_strength_smoothed ? attack : release
  talk_strength_smoothed = talk_strength_smoothed + (target - talk_strength_smoothed) * lerp
  return talk_strength_smoothed
}

audio_file_input.addEventListener('change', () => {
  const file = audio_file_input.files?.[0]
  if (!file) return

  const url = URL.createObjectURL(file)
  audio_el.src = url
  audio_el.load()
  setStatus('Audio loaded. Press “Enable audio + start”.')
})

start_button.addEventListener('click', async () => {
  try {
    ensureAudioGraph()
    if (audio_ctx?.state === 'suspended') await audio_ctx.resume()

    await audio_el.play()
    start_button.disabled = true
    stop_button.disabled = false
    setStatus('Playing. Recording available.')
  } catch (err) {
    console.error(err)
    setStatus('Failed to start audio (browser gesture/autoplay restrictions?).')
  }
})

stop_button.addEventListener('click', () => {
  audio_el.pause()
  audio_el.currentTime = 0
  start_button.disabled = false
  stop_button.disabled = true
  setStatus('Stopped.')
})

// --- Recording ---
let media_recorder: MediaRecorder | null = null
let recorded_chunks: BlobPart[] = []

function pickRecorderMimeType(): string | null {
  const preferred = 'video/webm;codecs=vp9,opus'
  if (MediaRecorder.isTypeSupported(preferred)) return preferred

  const fallback = 'video/webm;codecs=vp8,opus'
  if (MediaRecorder.isTypeSupported(fallback)) return fallback

  if (MediaRecorder.isTypeSupported('video/webm')) return 'video/webm'

  return null
}

start_record_button.addEventListener('click', () => {
  try {
    ensureAudioGraph()

    const canvas_stream = scene_canvas.captureStream(60)
    const audio_stream = audio_stream_dest?.stream

    if (!audio_stream) throw new Error('Missing audio stream')

    const stream = new MediaStream([
      ...canvas_stream.getVideoTracks(),
      ...audio_stream.getAudioTracks(),
    ])

    const mime_type = pickRecorderMimeType() || undefined
    media_recorder = new MediaRecorder(stream, mime_type ? { mimeType: mime_type } : undefined)

    recorded_chunks = []
    download_link.hidden = true

    media_recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) recorded_chunks.push(ev.data)
    }

    media_recorder.onstop = () => {
      const blob = new Blob(recorded_chunks, { type: media_recorder?.mimeType || 'video/webm' })
      const url = URL.createObjectURL(blob)

      download_link.href = url
      download_link.textContent = 'Download recording'
      download_link.hidden = false

      setStatus('Recording ready to download.')
    }

    media_recorder.start()
    start_record_button.disabled = true
    stop_record_button.disabled = false
    setStatus('Recording…')
  } catch (err) {
    console.error(err)
    setStatus('Failed to start recording. See console.')
  }
})

stop_record_button.addEventListener('click', () => {
  if (!media_recorder) return
  media_recorder.stop()
  start_record_button.disabled = false
  stop_record_button.disabled = true
})

function resizeRendererToDisplaySize(): void {
  const width = Math.max(1, Math.floor(window.innerWidth))
  const height = Math.max(1, Math.floor(window.innerHeight))

  const needs_resize = scene_canvas.width !== width || scene_canvas.height !== height
  if (!needs_resize) return

  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}

function animate(): void {
  requestAnimationFrame(animate)
  resizeRendererToDisplaySize()

  const dt_s = Math.min(clock.getDelta(), 0.05)
  const t = clock.getElapsedTime()

  const debug_home_pose = debug_home_pose_input.checked

  // If we're debugging home pose, or aligning world axes to the model for debugging, lock the camera to a static head-on view.
  const should_lock_camera = debug_home_pose ||
    (enable_axes_helper_input.checked && align_world_axes_to_model_input.checked)

  if (should_lock_camera && !home_camera_lock_active) {
    saved_camera_position.copy(camera.position)
    saved_camera_quaternion.copy(camera.quaternion)
    saved_controls_target.copy(controls.target)
    saved_controls_enabled = controls.enabled
    home_camera_lock_active = true
  }

  if (!should_lock_camera && home_camera_lock_active) {
    camera.position.copy(saved_camera_position)
    camera.quaternion.copy(saved_camera_quaternion)
    controls.target.copy(saved_controls_target)
    controls.enabled = saved_controls_enabled
    controls.update()
    home_camera_lock_active = false
  }

  if (should_lock_camera) {
    controls.enabled = false

    // Head-on view.
    // - In home-pose debug: camera is world-anchored, looking at origin.
    // - In axis-align debug: camera is aligned to the model frame, looking at the model.
    if (debug_home_pose) {
      tmp_camera_lock_target.copy(origin)
      tmp_camera_lock_forward.set(0, 0, 1)
      tmp_camera_lock_up.set(0, 1, 0)
    } else {
      if (monitor_root) tmp_camera_lock_target.copy(monitor_root.position)
      else tmp_camera_lock_target.copy(world_axes_base_position)

      tmp_camera_lock_forward.set(0, 0, 1)
      tmp_camera_lock_up.set(0, 1, 0)

      if (monitor_root) {
        tmp_camera_lock_forward.applyQuaternion(monitor_root.quaternion).normalize()
        tmp_camera_lock_up.applyQuaternion(monitor_root.quaternion).normalize()
      }
    }

    camera.up.copy(tmp_camera_lock_up)
    camera.position.copy(tmp_camera_lock_target).addScaledVector(tmp_camera_lock_forward, home_camera_distance)
    camera.lookAt(tmp_camera_lock_target)

    controls.target.copy(tmp_camera_lock_target)
    controls.update()
  }

  const analyser = analyser_node
  const buffer = time_domain_buffer

  let talk_strength = 0

  const manual_strength = getManualPreviewTalkStrength(t)
  if (manual_strength !== null) {
    talk_strength = smoothTalkStrength(manual_strength)
  } else if (analyser && buffer && !audio_el.paused) {
    const rms = computeRms(analyser, buffer)
    talk_strength = smoothTalkStrength(shapeTalkStrength(rms))
  } else {
    talk_strength = smoothTalkStrength(0)
  }

  // Personality motion offsets (added on top of the existing idle animation).
  let talk_offset_x = 0
  let talk_offset_y = 0
  let talk_offset_z = 0

  let talk_rot_x = 0
  let talk_rot_y = 0
  let talk_rot_z = 0

  const manual_p = getManualPreviewProgress(t)
  const motion_enabled = Boolean(talk_motion_active && manual_preview_forced_style && manual_p !== null)

  if (motion_enabled && manual_p !== null) {
    const tt = t - talk_motion_start_t

    // Smooth motion envelope (not tied to syllable-level talk_strength).
    const motion_amount = Math.min(
      smoothstep(0, 0.18, manual_p),
      1 - smoothstep(0.82, 1, manual_p),
    )

    if (talk_motion_style === 'excited_hover') {
      const amt = motion_amount
      talk_offset_y += Math.sin(t * 2.2) * 0.02 * amt
      talk_offset_x += Math.sin(t * 1.7) * 0.05 * amt
      talk_offset_z += Math.sin(t * 0.9) * Math.cos(t * 1.3) * 0.04 * amt
      talk_rot_z += Math.sin(t * 2.6) * 0.25 * amt
    } else if (talk_motion_style === 'spin_bursts') {
      // Spin a whole-number of turns so the preview ends at the same orientation.
      const spin_turns = 2
      const spin_p = easeInOutCubic(manual_p)
      talk_rot_y += spin_turns * Math.PI * 2 * spin_p

      // Add a tiny drift so it doesn't feel perfectly mechanical.
      talk_offset_x += Math.sin(t * 2.4) * 0.01 * motion_amount
    } else if (talk_motion_style === 'orbit_swoop') {
      const a = tt * 1.3
      const r = 0.06 * motion_amount

      talk_offset_x += Math.cos(a) * r
      talk_offset_z += Math.sin(a) * r
      talk_offset_y += Math.sin(tt * 1.8) * 0.01 * motion_amount

      talk_rot_z += Math.sin(a) * 0.18 * motion_amount
    }

    // Guardrails
    talk_offset_x = clampAbs(talk_offset_x, 0.12)
    talk_offset_y = clampAbs(talk_offset_y, 0.06)
    talk_offset_z = clampAbs(talk_offset_z, 0.12)
    talk_rot_z = clampAbs(talk_rot_z, 0.45)
  }

  const model_pos_offset_x = parseNumberInput(model_pos_x_input)
  const model_pos_offset_y = parseNumberInput(model_pos_y_input)
  const model_pos_offset_z = parseNumberInput(model_pos_z_input)

  if (debug_home_pose) {
    // Strict baseline:
    // - freeze all motion
    // - camera is locked head-on
    // - model transform is driven ONLY by the debug sliders (plus the base position, typically 0,0,0)
    if (monitor_root) {
      if (monitor_root_base_position) {
        monitor_root.position.set(
          monitor_root_base_position.x + model_pos_offset_x,
          monitor_root_base_position.y + model_pos_offset_y,
          monitor_root_base_position.z + model_pos_offset_z,
        )
      } else {
        monitor_root.position.set(model_pos_offset_x, model_pos_offset_y, model_pos_offset_z)
      }

      updateLookRotQuat(tmp_quat_look_rot)
      monitor_root.quaternion.copy(tmp_quat_look_rot)
    }
  } else {
    // Determine when the avatar is "needed". For now: the whole time audio is playing.
    const is_talking = manual_preview_active || !audio_el.paused

    talk_needed_active = is_talking

    // Start a new approach window when talking begins.
    if (talk_needed_active && !talk_needed_was_active) {
      const jitter = randRange(-talk_camera_approach_duration_jitter_s, talk_camera_approach_duration_jitter_s)
      const duration_s = Math.max(0.6, talk_camera_approach_duration_base_s + jitter)
      talk_camera_approach_end_t = t + duration_s
    }
    talk_needed_was_active = talk_needed_active

    const attention_target = talk_needed_active ? 1 : 0
    attention_amount = dampNumber(
      attention_amount,
      attention_target,
      talk_needed_active ? talk_attention_lambda : idle_attention_lambda,
      dt_s,
    )

    // While talking we should still drift (not become rigid), but keep it closer to "home".
    const pos_scale = talk_needed_active ? 0.7 : 1.0

    // When talking we don't need to perfectly "lock" rotation; we just want it to stay generally near home.
    const min_rot_scale_when_talking = 0.35
    const rot_scale = 1 - attention_amount * (1 - min_rot_scale_when_talking)

    // Update wander goal every few seconds.
    if (t >= wander_next_goal_t) {
      const wander_xy_range = talk_needed_active ? 0.07 : 0.14
      const wander_y_min = talk_needed_active ? -0.03 : -0.05
      const wander_y_max = talk_needed_active ? 0.07 : 0.10

      wander_goal_offset.set(
        randRange(-wander_xy_range, wander_xy_range),
        randRange(wander_y_min, wander_y_max),
        randRange(-wander_xy_range, wander_xy_range),
      )

      const next_min = talk_needed_active ? 0.9 : 1.3
      const next_max = talk_needed_active ? 2.1 : 3.2
      wander_next_goal_t = t + randRange(next_min, next_max)
    }

    // Smoothly drift toward the goal.
    const wander_lambda = talk_needed_active ? 2.1 : 1.25
    wander_offset.x = dampNumber(wander_offset.x, wander_goal_offset.x, wander_lambda, dt_s)
    wander_offset.y = dampNumber(wander_offset.y, wander_goal_offset.y, wander_lambda, dt_s)
    wander_offset.z = dampNumber(wander_offset.z, wander_goal_offset.z, wander_lambda, dt_s)

    // Apply base + idle + wander + talk offsets.
    if (monitor_root && monitor_root_base_position && monitor_root_base_quaternion) {
      // Keep the existing idle motion as a subtle baseline.
      const idle_offset_y = (halo_idle_enabled && idle_bob_sampler)
        ? idle_bob_sampler.sampleOffset(t) * idle_bob_amplitude
        : Math.sin(t * 0.9) * 0.04
      const idle_rot_y = Math.sin(t * 0.25) * 0.35 * rot_scale
      const idle_rot_x = Math.sin(t * 0.35) * 0.06 * rot_scale

      // Companion wander.
      const wander_x = wander_offset.x * pos_scale
      const wander_y = wander_offset.y * pos_scale
      const wander_z = wander_offset.z * pos_scale

      // Base position (without the talk-time approach offset).
      tmp_base_pos.set(
        monitor_root_base_position.x + model_pos_offset_x + wander_x + talk_offset_x,
        monitor_root_base_position.y + model_pos_offset_y + idle_offset_y + wander_y + talk_offset_y,
        monitor_root_base_position.z + model_pos_offset_z + wander_z + talk_offset_z,
      )

      // Include the approach offset when computing facing, so lookAt uses the true rendered position.
      monitor_root.position.copy(tmp_base_pos).add(talk_camera_approach_offset)

      // "Home" rotation (decoupled from camera): base orientation + user look rotation offset.
      tmp_quat_c.copy(monitor_root_base_quaternion)
      updateLookRotQuat(tmp_quat_look_rot)
      tmp_quat_c.multiply(tmp_quat_look_rot)

      // While talking, update the persistent facing offset toward the camera.
      // When talking ends, we keep this offset (so we don't snap back to the original home direction).
      if (talk_needed_active && monitor_face_to_neg_z_quat) {
        tmp_mat_a.lookAt(monitor_root.position, camera.position, world_up)
        tmp_quat_face_camera.setFromRotationMatrix(tmp_mat_a)
        tmp_quat_face_camera.multiply(monitor_face_to_neg_z_quat)

        // desired_offset = inverse(base_quat) * face_camera_quat
        tmp_quat_a.copy(tmp_quat_c).invert()
        tmp_quat_b.copy(tmp_quat_a).multiply(tmp_quat_face_camera)

        const alpha = (1 - Math.exp(-talk_attention_lambda * dt_s)) * attention_amount
        talk_camera_face_offset_quat.slerp(tmp_quat_b, alpha)
      }

      // Apply the persistent facing offset.
      tmp_quat_c.multiply(talk_camera_face_offset_quat)

      if (halo_aim_enabled && aim_overlay_sampler && !debug_home_pose) {
        const aim_sample = aim_overlay_sampler.sample(t)
        tmp_quat_a.copy(tmp_quat_c)
        tmp_quat_b.copy(tmp_quat_c).multiply(aim_sample.rotation)
        tmp_quat_c.copy(tmp_quat_a).slerp(tmp_quat_b, aim_overlay_blend * attention_amount)
      }

      const wander_bank_z = (Math.sin(t * 0.7) * 0.06 - wander_offset.x * 0.25) * rot_scale
      const wander_tilt_x = (Math.sin(t * 0.55 + 1.2) * 0.03 + wander_offset.z * 0.15) * rot_scale

      tmp_euler_a.set(
        idle_rot_x + wander_tilt_x + talk_rot_x,
        idle_rot_y + talk_rot_y,
        wander_bank_z + talk_rot_z,
      )

      // Apply additional motion offsets.
      tmp_quat_b.setFromEuler(tmp_euler_a)
      monitor_root.quaternion.copy(tmp_quat_c).multiply(tmp_quat_b)

      // Talk-time approach: fly forward in the direction the monitor is currently facing.
      // This makes the motion feel more natural while it is turning to face the camera.
      const approach_active = talk_needed_active || attention_amount > 0.001
      if (approach_active && monitor_face_forward_local) {
        camera.getWorldDirection(tmp_camera_forward).normalize()
        tmp_camera_approach_target.copy(camera.position).addScaledVector(tmp_camera_forward, talk_camera_approach_distance)

        tmp_camera_approach_to_target.copy(tmp_camera_approach_target).sub(monitor_root.position)
        const dist_needed = tmp_camera_approach_to_target.length()
        if (dist_needed > 0.000001) tmp_camera_approach_to_target.multiplyScalar(1 / dist_needed)

        tmp_face_forward_world.copy(monitor_face_forward_local).applyQuaternion(monitor_root.quaternion).normalize()

        // Only move if we're at least somewhat facing the target.
        const facing_dot = tmp_camera_approach_to_target.dot(tmp_face_forward_world)
        if (dist_needed > 0.000001 && facing_dot > talk_camera_approach_min_facing_dot) {
          // Steer slightly toward the target direction to avoid ending left/right of center.
          const steer_amount = clamp01((1 - facing_dot) * talk_camera_approach_steer_strength) * attention_amount
          tmp_move_dir.copy(tmp_face_forward_world).lerp(tmp_camera_approach_to_target, steer_amount).normalize()

          // Ease out as we get close so it doesn't "snap" to a stop.
          const slow_scale = smoothstep(0, talk_camera_approach_slow_distance, dist_needed)

          const time_left_s = Math.max(talk_camera_approach_min_time_left_s, talk_camera_approach_end_t - t)
          const needed_speed = Math.min(talk_camera_approach_max_speed, dist_needed / time_left_s)

          const drive = talk_needed_active ? 1 : attention_amount
          const max_step = needed_speed * drive * dt_s * slow_scale
          const step = Math.min(dist_needed, max_step)

          talk_camera_approach_offset.addScaledVector(tmp_move_dir, step)
        }
      }

      // Apply the updated approach offset.
      monitor_root.position.copy(tmp_base_pos).add(talk_camera_approach_offset)
    }
  }

  // Look debug readout.
  setLookStatus(
    `look_rot_deg: x=${parseNumberInput(look_rot_x_deg_input).toFixed(0)} y=${parseNumberInput(look_rot_y_deg_input).toFixed(0)} z=${parseNumberInput(look_rot_z_deg_input).toFixed(0)} home_debug=${debug_home_pose ? 'on' : 'off'}`,
  )

  // Rendering tuning
  renderer.toneMapping = enable_aces_input.checked ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping
  renderer.toneMappingExposure = parseNumberInput(exposure_input)

  // With FBX MeshPhongMaterial, scene.environment won't apply. We set envMap per material instead.
  scene.environment = null

    // Light tuning
    const world_axes_enabled = enable_axes_helper_input.checked
    axes_helper.visible = world_axes_enabled

    grid_floor.visible = enable_grid_floor_input.checked

  if (!debug_home_pose && world_axes_enabled && align_world_axes_to_model_input.checked && monitor_root) {
    // “World axes” becomes a baseline reference aligned to the model's current orientation.
    axes_helper.position.copy(monitor_root.position)
    axes_helper.quaternion.copy(monitor_root.quaternion)
  } else {
    axes_helper.position.copy(world_axes_base_position)
    axes_helper.quaternion.identity()
  }

  model_axes_helper.visible = enable_model_axes_helper_input.checked
  const model_forward_visible = enable_model_forward_helper_input.checked
  model_forward_arrow_pos.visible = model_forward_visible
  model_forward_arrow_neg.visible = model_forward_visible

  const hemi_enabled = enable_hemi_light_input.checked
  hemi_light.visible = hemi_enabled
  hemi_light.intensity = hemi_enabled ? parseNumberInput(hemi_light_intensity_input) : 0

  const dir_enabled = enable_dir_light_input.checked
  dir_light.visible = dir_enabled
  dir_light.intensity = dir_enabled ? parseNumberInput(dir_light_intensity_input) : 0

  const ambient_enabled = enable_ambient_light_input.checked
  ambient_light.visible = ambient_enabled
  ambient_light.intensity = ambient_enabled ? parseNumberInput(ambient_light_intensity_input) : 0

  const bounce_enabled = enable_bounce_light_input.checked
  bounce_light.visible = bounce_enabled
  bounce_light.intensity = bounce_enabled ? parseNumberInput(bounce_light_intensity_input) : 0

  const idle_glow = parseNumberInput(idle_glow_input)
  const talk_scale = parseNumberInput(talk_scale_input)

  const eye_glow_color = computeEyeGlowColor(eye_color_tmp)

  // Eye core should not pick up env/IBL reflections (but should still react to actual lights).
  ensureEyeCoreNoEnvReflections()

  // Eye (core): solid Halo-blue emissive color; preserve texture detail via emissiveMap.
  // IMPORTANT: Only glow when selected as a talk material. When nothing is selected, the eye core should not glow.
  if (eye_core_material) {

    // Ensure emissiveMap stays bound (in case it was swapped).
    if (eye_core_material.map && eye_core_material.emissiveMap !== eye_core_material.map) {
      eye_core_material.emissiveMap = eye_core_material.map
      fixMaterialColorSpaces(eye_core_material)
      eye_core_material.needsUpdate = true
    }

    const core_selected = talk_material_uuid_set.has(eye_core_material.uuid)

    if (core_selected) {
      eye_core_material.emissive = eye_core_material.emissive ?? new THREE.Color(eye_glow_color)
      eye_core_material.emissive.copy(eye_glow_color)

      // Let the normal talk target pipeline control emissiveIntensity when selected.
      // We only enforce color + map bindings here.
      eye_core_material.needsUpdate = true
    } else {
      // Restore "off" baseline.
      const baseline = material_baseline_by_uuid.get(eye_core_material.uuid)
      eye_core_material.emissive = eye_core_material.emissive ?? new THREE.Color(0x000000)
      eye_core_material.emissive.setHex(baseline?.emissive_hex ?? 0x000000)
      eye_core_material.emissiveIntensity = baseline?.emissive_intensity ?? 0
      eye_core_material.needsUpdate = true
    }

    talk_light_eye_front.color.copy(eye_glow_color)
    talk_light_eye_back.color.copy(eye_glow_color)
  }

  // Keep eye spill light color consistent even if only shell/inner-eye are selected.
  talk_light_eye_front.color.copy(eye_glow_color)
  talk_light_eye_back.color.copy(eye_glow_color)

  for (const target of talk_targets) {
    // Force emissive colors for key materials where FBX often sets emissive but leaves it black.
    const is_leds = Boolean(leds_material && target.material.uuid === leds_material.uuid)
    const is_eye_shell = Boolean(eye_shell_material && target.material.uuid === eye_shell_material.uuid)
    const is_inner_eye = Boolean(inner_eye_material && target.material.uuid === inner_eye_material.uuid)
    const is_eye_core = Boolean(eye_core_material && target.material.uuid === eye_core_material.uuid)

    if (is_leds) {
      target.material.emissive = target.material.emissive ?? new THREE.Color(0x66ccff)
      target.material.emissive.setHex(0x66ccff)
    } else if (is_eye_shell || is_inner_eye || is_eye_core) {
      target.material.emissive = target.material.emissive ?? new THREE.Color(eye_glow_color)
      target.material.emissive.copy(eye_glow_color)
    } else if (!target.material.emissive) {
      target.material.emissive = new THREE.Color(0x66ccff)
    }

    const intensity = idle_glow + talk_strength * talk_scale * target.talk_weight
    target.material.emissiveIntensity = intensity
    target.material.needsUpdate = true

    if (target.material instanceof THREE.MeshPhongMaterial) applyPhongLookControls(target.material)
  }

  // Apply look controls to all other phong materials too (so highlight washout can be tuned globally).
  for (const mat of materials) {
    if (!(mat instanceof THREE.MeshPhongMaterial)) continue

    // materials already have baseline captured during traversal
    applyPhongLookControls(mat)
  }

  // Re-assert eye core env/IBL off after global phong controls (which may set envMap).
  ensureEyeCoreNoEnvReflections()

  // Talk spill lights (point lights) originate from selected emissive features.
  const point_lights_enabled = use_point_light_input.checked

  const talk_eye_enabled = point_lights_enabled && enable_talk_light_eye_input.checked
  const talk_other_enabled = point_lights_enabled && enable_talk_light_inner_input.checked

  const eye_selected =
    (eye_core_material && talk_material_uuid_set.has(eye_core_material.uuid)) ||
    (eye_shell_material && talk_material_uuid_set.has(eye_shell_material.uuid)) ||
    (inner_eye_material && talk_material_uuid_set.has(inner_eye_material.uuid))

  const leds_selected = leds_material ? talk_material_uuid_set.has(leds_material.uuid) : false
  const booster_selected = booster_material ? talk_material_uuid_set.has(booster_material.uuid) : false

  const eye_spill_total = talk_eye_enabled && eye_selected ? Math.max(0, talk_strength * 3.8) : 0
  talk_light_eye_front.visible = talk_eye_enabled
  talk_light_eye_back.visible = talk_eye_enabled

  // Bias a bit forward so it reads as coming from the eye's "front".
  talk_light_eye_front.intensity = eye_spill_total * 0.6
  talk_light_eye_back.intensity = eye_spill_total * 0.4

  const other_spill_total = talk_other_enabled ? Math.max(0, talk_strength * 3.0) : 0
  talk_light_leds.visible = talk_other_enabled
  talk_light_booster.visible = talk_other_enabled

  const w_leds = leds_selected ? 1.0 : 0
  const w_booster = booster_selected ? 0.9 : 0
  const w_sum = w_leds + w_booster

  if (w_sum <= 0) {
    talk_light_leds.intensity = 0
    talk_light_booster.intensity = 0
  } else {
    // Slightly bias the "other" spill toward the booster (LEDs should read primarily via emissiveMap).
    talk_light_leds.intensity = other_spill_total * (w_leds / w_sum) * 0.12
    talk_light_booster.intensity = other_spill_total * (w_booster / w_sum)
  }

  for (const helper of highlight_helpers) helper.update()

  setLightsStatus(
    `lights: hemi=${hemi_light.intensity.toFixed(2)} dir=${dir_light.intensity.toFixed(2)} amb=${ambient_light.intensity.toFixed(2)} bounce=${bounce_light.intensity.toFixed(2)} eye_f=${talk_light_eye_front.intensity.toFixed(2)} eye_b=${talk_light_eye_back.intensity.toFixed(2)} leds=${talk_light_leds.intensity.toFixed(2)} boost=${talk_light_booster.intensity.toFixed(2)}`,
  )

  setRenderStatus(
    `render: aces=${enable_aces_input.checked ? 'on' : 'off'} exposure=${renderer.toneMappingExposure.toFixed(2)} env=${enable_env_input.checked ? 'on' : 'off'} specular=${parseNumberInput(phong_specular_input).toFixed(2)} shininess=${parseNumberInput(phong_shininess_input).toFixed(0)}`,
  )

  controls.update()
  renderer.render(scene, camera)
}

animate()
