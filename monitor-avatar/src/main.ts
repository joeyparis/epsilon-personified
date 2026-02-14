import './style.css'

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

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

const app_el = document.querySelector<HTMLDivElement>('#app')
if (!app_el) throw new Error('Missing #app element')

app_el.innerHTML = `
  <canvas id="scene_canvas"></canvas>
  <div id="hud">
    <h1>Monitor Avatar</h1>
    <p class="sub">Audio-driven glow “mouth” + in-browser recording (.webm)</p>

    <div class="section">
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

    <div class="section">
      <h2>Talk glow</h2>
      <div class="row stack">
        <div class="row" style="justify-content: space-between">
          <span style="font-size: 12px; opacity: 0.9">Talk materials</span>
          <button id="select_recommended_button" type="button" disabled>Select recommended</button>
        </div>
        <div id="talk_materials_list"></div>
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

    <div class="section">
      <h2>Lights</h2>
      <div id="lights_list" class="row stack">
        <label><input id="enable_hemi_light" type="checkbox" checked /> Fill (hemisphere)</label>
        <label><input id="enable_dir_light" type="checkbox" checked /> Overhead (directional)</label>
        <label><input id="enable_ambient_light" type="checkbox" checked /> Ambient</label>
        <label><input id="enable_bounce_light" type="checkbox" checked /> Bounce (below)</label>
        <label><input id="enable_talk_light_inner" type="checkbox" checked /> Talk spill (LEDs + booster)</label>
        <label><input id="enable_talk_light_eye" type="checkbox" checked /> Talk spill (eye front/back)</label>
        <label><input id="enable_axes_helper" type="checkbox" checked /> Debug axes</label>
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

    <div class="section">
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
          <span style="font-size: 12px; opacity: 0.9">Eye textures</span>
          <button id="rebind_eye_texture_button" type="button" disabled>Rebind eye textures</button>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Status</h2>
      <div class="row stack">
        <small class="mono" id="status_el">Loading model…</small>
        <small class="mono" id="lights_status_el"></small>
        <small class="mono" id="render_status_el"></small>
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

const enable_aces_input = mustGetElement<HTMLInputElement>('#enable_aces')
const exposure_input = mustGetElement<HTMLInputElement>('#exposure')
const phong_specular_input = mustGetElement<HTMLInputElement>('#phong_specular')
const phong_shininess_input = mustGetElement<HTMLInputElement>('#phong_shininess')
const enable_env_input = mustGetElement<HTMLInputElement>('#enable_env')
const env_reflectivity_input = mustGetElement<HTMLInputElement>('#env_reflectivity')
const rebind_eye_texture_button = mustGetElement<HTMLButtonElement>('#rebind_eye_texture_button')

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

  for (const section of sections) {
    const h2 = section.querySelector<HTMLElement>('h2')
    if (!h2) continue

    h2.tabIndex = 0
    h2.setAttribute('role', 'button')
    h2.setAttribute('aria-expanded', 'true')

    const setCollapsed = (collapsed: boolean): void => {
      section.classList.toggle('collapsed', collapsed)
      h2.setAttribute('aria-expanded', collapsed ? 'false' : 'true')

      for (const child of [...section.children]) {
        if (child === h2) continue
        ;(child as HTMLElement).hidden = collapsed
      }
    }

    const toggle = (): void => {
      const next_collapsed = !section.classList.contains('collapsed')
      setCollapsed(next_collapsed)
    }

    h2.addEventListener('click', toggle)
    h2.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return
      ev.preventDefault()
      toggle()
    })

    // Default: expanded
    setCollapsed(false)
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
axes_helper.position.set(0, 0.1, 0)
scene.add(axes_helper)

let monitor_root: THREE.Object3D | null = null
let materials: material_with_emissive[] = []
let talk_targets: talk_target[] = []
let talk_material_uuid_set = new Set<string>()

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
    monitor_root = object
    monitor_root.rotation.y = Math.PI

    let mesh_count = 0
    const material_by_uuid = new Map<string, material_with_emissive>()

    monitor_root.traverse((child) => {
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
    rebind_eye_texture_button.disabled = false
    ensureSketchfabTexturesBound()

    select_recommended_button.disabled = false
    selectRecommendedTalkMaterials()

    const box = new THREE.Box3().setFromObject(monitor_root)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())

    const max_dim = Math.max(size.x, size.y, size.z)
    const desired_size = 1.1
    const scale = max_dim > 0 ? desired_size / max_dim : 1

    // Important: FBX units are huge. We must center using the *scaled* center, otherwise the model
    // gets translated hundreds of world units away and becomes invisible.
    monitor_root.scale.setScalar(scale)
    monitor_root.position.set(-center.x * scale, -center.y * scale, -center.z * scale)

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

    monitor_root.updateMatrixWorld(true)

    // Eye front/back are derived from the eye core material bounds.
    if (eye_core_material) {
      const bounds = computeMaterialBoundsInRoot(monitor_root, eye_core_material.uuid)
      if (bounds) {
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
    bounce_light.position.set(0, -Math.max(0.35, (box.max.y - center.y) * scale * 0.9), 0.1)

    scene.add(monitor_root)

    camera.position.set(0, 0.35, 2.15)
    camera.lookAt(0, 0.15, 0)

    setStatus(
      `Model loaded (meshes: ${mesh_count}, materials: ${materials.length}, size: ${size.x.toFixed(2)},${size.y.toFixed(2)},${size.z.toFixed(2)}). Audio glow will animate whenever audio is playing.`,
    )
    start_button.disabled = false
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

rebind_eye_texture_button.addEventListener('click', () => {
  ensureSketchfabTexturesBound(true)

  const shell_base = textureBasename(eye_shell_material?.map) ?? '(none)'
  const inner_base = textureBasename(inner_eye_material?.map) ?? '(none)'
  const core_base = textureBasename(eye_core_material?.map) ?? '(none)'
  const leds_base = textureBasename(leds_material?.map) ?? '(none)'
  const booster_base = textureBasename(booster_material?.map) ?? '(none)'

  setStatus(
    `Textures: eye_shell=${shell_base} eye_inner=${inner_base} eye_core=${core_base} leds=${leds_base} booster=${booster_base}`,
  )
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

  clock.getDelta()
  const t = clock.getElapsedTime()

  if (monitor_root) {
    monitor_root.position.y = Math.sin(t * 0.9) * 0.04
    monitor_root.rotation.y = Math.PI + Math.sin(t * 0.25) * 0.35
    monitor_root.rotation.x = Math.sin(t * 0.35) * 0.06
  }

  const analyser = analyser_node
  const buffer = time_domain_buffer

  let talk_strength = 0
  if (analyser && buffer && !audio_el.paused) {
    const rms = computeRms(analyser, buffer)
    talk_strength = smoothTalkStrength(shapeTalkStrength(rms))
  } else {
    talk_strength = smoothTalkStrength(0)
  }

  // Rendering tuning
  renderer.toneMapping = enable_aces_input.checked ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping
  renderer.toneMappingExposure = parseNumberInput(exposure_input)

  // With FBX MeshPhongMaterial, scene.environment won't apply. We set envMap per material instead.
  scene.environment = null

  // Light tuning
  axes_helper.visible = enable_axes_helper_input.checked

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
