import {
  BufferGeometry,
  CanvasTexture,
  AdditiveBlending,
  ClampToEdgeWrapping,
  DoubleSide,
  Color,
  Float32BufferAttribute,
  Mesh,
  NearestFilter,
  ACESFilmicToneMapping,
  NoToneMapping,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Uint32BufferAttribute,
  WebGLRenderer,
} from 'three';

import type {
  WorldCharacterPlacement,
  WorldFloorPlacement,
  WorldFrameState,
  WorldPropPlacement,
  WorldRoofPlacement,
  WorldWallPlacement,
} from '../world-frame';
import { shelteredTileKeys } from '../world-frame';
import { groundSunTint, groundVariationField, sampleGroundVariation } from '../ground-light';
import type { ToneMappingKind } from '../renderer-selection';
import { threeCameraBounds, threeDrawingBufferSize, threeQuadIndices, threeRasterViewport } from './coordinate-contract';

const TILE_SIZE = 32;

/**
 * Props that emit light. Glow is drawn at the sprite, so a lit room reads as lit wherever the
 * player is standing, rather than only near the map's three fixed district pools.
 */
const LAMP_SPRITE_IDS: ReadonlySet<string> = new Set([
  'tile.fixture-lamp',
  'tile.fixture-dock-lamp-amber',
  'tile.fixture-dock-lamp-cold',
  'tile.fixture-festival-lantern',
  'tile.fixture-neon-lamp-cyan',
  'tile.fixture-neon-lamp-magenta',
]);
const LAMP_GLOW_RADIUS = 44;

/** Handoff technique 6: silhouette shadow tint, opacity and offset, in logical pixels. */
const SPRITE_SHADOW_COLOR = '#111519';
const SPRITE_SHADOW_OPACITY = 0.48;
const SPRITE_SHADOW_OFFSET_X = 3;
const SPRITE_SHADOW_OFFSET_Y = 3;
/**
 * The silhouette shadow ROTATES with the sun but keeps technique 6's measured LENGTH.
 *
 * The length is what was measured; the direction was an assumption baked in beside it. Letting the
 * length follow the sun too would displace a prop's silhouette copy by 25 pixels at dusk, which
 * detaches it from the prop it belongs to. So the sun turns it and never stretches it, and at
 * every minute of the day it stays exactly as long as the value technique 6 recorded.
 */
const SPRITE_SHADOW_LENGTH = Math.hypot(SPRITE_SHADOW_OFFSET_X, SPRITE_SHADOW_OFFSET_Y);
/** Corner order matched to `addQuad`: top-left, top-right, bottom-right, bottom-left. */
const GROUND_CORNER_UNITS: readonly (readonly [number, number])[] = Object.freeze([
  [0, 0], [1, 0], [1, 1], [0, 1],
]);
/** Stage 4 recorded ACES calibration value, not a hidden magic number. */
export const ACES_EXPOSURE = 1;
const COMPOSITE_BATCHES = [
  'floor-and-ground-detail',
  'doors',
  'door-wear',
  'contact-shadows-and-thresholds',
  // One-shot marks that belong to the GROUND: ripples, footfall dust, blood. Below the sprite
  // shadows and the characters, so a ripple reads as water the player is standing in rather than a
  // sticker over their legs. Aerial one-shots share the existing 'effects' batch instead.
  'ground-effects',
  // Handoff technique 6: a tinted copy of each grounded sprite, offset, so the shadow follows the
  // real pixel silhouette instead of a generic blob. This is what gives furniture and characters
  // contact with the floor and makes their edges read as sharper.
  'sprite-shadows',
  // Lamp glow lights the floor, so it sits BELOW the foreground sprites and above the shadows.
  // Placed after the characters it washed over them and cost the player readable coverage. Walls
  // and roofs still come later, so a roof occludes the room it covers.
  'lamp-glow',
  'selection-ring',
  'grounded-props-and-characters',
  'effects',
  'walls',
  'wall-bases',
  'roofs',
  'shelter-shade',
  'district-shadows',
  'district-light-pools',
  'atmosphere',
  'destination-pulse',
  'journal-markers',
  'failure-marker',
] as const;
type BatchId = typeof COMPOSITE_BATCHES[number];

type AtlasPlacement = WorldFloorPlacement | WorldPropPlacement | WorldCharacterPlacement | WorldWallPlacement | WorldRoofPlacement;
type GeometryData = Readonly<{
  positions: number[];
  uvs: number[];
  tints: number[];
  indices: number[];
}>;

const emptyGeometryData = (): GeometryData => ({ positions: [], uvs: [], tints: [], indices: [] });

function rgba(color: string, opacity = 1): readonly [number, number, number, number] {
  const normalized = color.startsWith('#') ? color.slice(1) : color;
  const rgb = normalized.length >= 6 ? normalized.slice(0, 6) : 'ffffff';
  const alpha = normalized.length === 8 ? Number.parseInt(normalized.slice(6), 16) / 255 : 1;
  const parsed = new Color(`#${rgb}`);
  // Keep float alpha. The browser composites the legacy overlays without quantizing to 8 bits,
  // so rounding here introduced a systematic error wherever translucent quads stack.
  return [parsed.r, parsed.g, parsed.b, alpha * opacity];
}

/**
 * `cornerTints` is 16 floats, four RGBA corners, and REPLACES the flat tint when given.
 *
 * The tint attribute is already per-vertex, so four different corners cost nothing extra: the
 * rasteriser interpolates them for free. Passing a reused buffer rather than four arrays keeps
 * the ground path allocation-free, which matters at ~11,000 corners on a worst-case frame.
 */
function addQuad(
  data: GeometryData,
  points: readonly [number, number][],
  color: string,
  opacity = 1,
  uv: readonly [number, number, number, number] = [0, 0, 1, 1],
  cornerTints?: Float32Array,
): void {
  const base = data.positions.length / 3;
  for (const [x, y] of points) data.positions.push(x, -y, 0);
  const [u0, v0, u1, v1] = uv;
  data.uvs.push(u0, v1, u1, v1, u1, v0, u0, v0);
  if (cornerTints) {
    for (let index = 0; index < 16; index += 1) data.tints.push(cornerTints[index] ?? 1);
  } else {
    const tint = rgba(color, opacity);
    for (let index = 0; index < 4; index += 1) data.tints.push(...tint);
  }
  data.indices.push(...threeQuadIndices(base));
}

/** Mote positions as viewport percentages, matching the legacy atmosphere overlay. */
const ATMOSPHERE_MOTES: readonly (readonly [number, number])[] = Object.freeze([
  [18, 24], [36, 64], [58, 31], [74, 53], [87, 18],
] as const);

/**
 * Rebuilds the legacy atmosphere drift from a sampled timestamp.
 * The overlay looped 0 to 1 over 3800 ms then back over 4600 ms, easing in and out of a sine.
 */
function atmosphereDrift(timestampMilliseconds: number): number {
  const inOutSin = (t: number): number => (
    t < 0.5 ? (1 - Math.cos(t * Math.PI)) / 2 : 1 - (1 - Math.cos((1 - t) * Math.PI)) / 2
  );
  const phase = ((timestampMilliseconds % 8_400) + 8_400) % 8_400;
  return phase < 3_800
    ? inOutSin(phase / 3_800)
    : 1 - inOutSin((phase - 3_800) / 4_600);
}

function addRect(data: GeometryData, x: number, y: number, width: number, height: number, color: string, opacity = 1): void {
  addQuad(data, [[x, y], [x + width, y], [x + width, y + height], [x, y + height]], color, opacity);
}

function addLine(
  data: GeometryData,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: string,
  roundCaps = false,
): void {
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length === 0) return;
  const px = -(y2 - y1) * width / length / 2;
  const py = (x2 - x1) * width / length / 2;
  addQuad(data, [[x1 + px, y1 + py], [x2 + px, y2 + py], [x2 - px, y2 - py], [x1 - px, y1 - py]], color);
  if (roundCaps) {
    addEllipse(data, x1, y1, width / 2, width / 2, color);
    addEllipse(data, x2, y2, width / 2, width / 2, color);
  }
}

function addEllipse(
  data: GeometryData,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  color: string,
  opacity = 1,
  strokeWidth = 0,
): void {
  const segments = 32;
  if (strokeWidth > 0) {
    const innerRadiusX = Math.max(0, radiusX - strokeWidth / 2);
    const innerRadiusY = Math.max(0, radiusY - strokeWidth / 2);
    const outerRadiusX = radiusX + strokeWidth / 2;
    const outerRadiusY = radiusY + strokeWidth / 2;
    for (let index = 0; index < segments; index += 1) {
      const start = index * Math.PI * 2 / segments;
      const end = (index + 1) * Math.PI * 2 / segments;
      addQuad(data, [
        [centerX + Math.cos(start) * innerRadiusX, centerY + Math.sin(start) * innerRadiusY],
        [centerX + Math.cos(start) * outerRadiusX, centerY + Math.sin(start) * outerRadiusY],
        [centerX + Math.cos(end) * outerRadiusX, centerY + Math.sin(end) * outerRadiusY],
        [centerX + Math.cos(end) * innerRadiusX, centerY + Math.sin(end) * innerRadiusY],
      ], color, opacity);
    }
    return;
  }
  const center = data.positions.length / 3;
  data.positions.push(centerX, -centerY, 0);
  data.uvs.push(0.5, 0.5);
  data.tints.push(...rgba(color, opacity));
  for (let index = 0; index <= segments; index += 1) {
    const angle = index * Math.PI * 2 / segments;
    data.positions.push(centerX + Math.cos(angle) * radiusX, -(centerY + Math.sin(angle) * radiusY), 0);
    data.uvs.push(0.5 + Math.cos(angle) / 2, 0.5 - Math.sin(angle) / 2);
    data.tints.push(...rgba(color, opacity));
    if (index > 0) data.indices.push(center, center + index + 1, center + index);
  }
}

function addAtlasPlacement(
  data: GeometryData,
  placement: AtlasPlacement,
  atlasWidth: number,
  atlasHeight: number,
  cornerTints?: Float32Array,
): void {
  const width = placement.source.width * placement.scale;
  const height = placement.source.height * placement.scale;
  const radians = placement.rotationDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const pivotX = placement.pivot.x * placement.scale;
  const pivotY = placement.pivot.y * placement.scale;
  const point = (x: number, y: number): [number, number] => {
    const localX = x - pivotX;
    const localY = y - pivotY;
    return [
      placement.worldX + pivotX + cosine * localX - sine * localY,
      placement.worldY + pivotY + sine * localX + cosine * localY,
    ];
  };
  addQuad(
    data,
    [point(0, 0), point(width, 0), point(width, height), point(0, height)],
    placement.color,
    placement.opacity,
    [
      placement.source.x / atlasWidth,
      1 - (placement.source.y + placement.source.height) / atlasHeight,
      (placement.source.x + placement.source.width) / atlasWidth,
      1 - placement.source.y / atlasHeight,
    ],
    cornerTints,
  );
}

/**
 * Writes one ground quad's four corner tints into a reused buffer.
 *
 * Floors are axis-aligned with no rotation and a zero pivot, so a quad's corners ARE tile corners
 * and the field can be sampled directly. Ground DETAILS share this batch and must take the same
 * light — otherwise a bush stays bright over darkened grass — but they are at most one tile and
 * carry pixel offsets, so they take one sample applied to all four corners.
 */
function writeGroundCornerTints(
  target: Float32Array,
  field: Float32Array,
  tileColumns: number,
  tileRows: number,
  sunTint: readonly [number, number, number],
  placement: WorldFloorPlacement,
): void {
  const tileX = placement.worldX / TILE_SIZE;
  const tileY = placement.worldY / TILE_SIZE;
  const spanX = placement.kind === 'floor' ? placement.source.width * placement.scale / TILE_SIZE : 0;
  const spanY = placement.kind === 'floor' ? placement.source.height * placement.scale / TILE_SIZE : 0;
  for (let corner = 0; corner < 4; corner += 1) {
    const unit = GROUND_CORNER_UNITS[corner] as readonly [number, number];
    const variation = sampleGroundVariation(
      field,
      tileColumns,
      tileRows,
      tileX + unit[0] * spanX,
      tileY + unit[1] * spanY,
    );
    target[corner * 4] = sunTint[0] * variation;
    target[corner * 4 + 1] = sunTint[1] * variation;
    target[corner * 4 + 2] = sunTint[2] * variation;
    target[corner * 4 + 3] = placement.opacity;
  }
}

/**
 * Additive light must not be tone mapped.
 *
 * ACES(floor) + ACES(glow) is not ACES(floor + glow). Running the curve on the glow before adding
 * it clips overlapping lamps and shifts their hue. Three.js only injects the tone-mapping chunk
 * when a material opts in, so the additive material leaves it out and adds linear light instead.
 */
function shaderMaterial(texture?: Texture, matchLegacyColors = false, additive = false): ShaderMaterial {
  const legacyColorTransform = matchLegacyColors ? `
        gl_FragColor.rgb = mat3(
          1.2249401, -0.0420569, -0.0196376,
          -0.2249404, 1.0420571, -0.0786361,
          0.0, 0.0, 1.0982735
        ) * gl_FragColor.rgb;
  ` : '';
  return new ShaderMaterial({
    // Lamp glow must ADD light to the floor. Alpha blending can only tint toward a colour, which
    // is why the shipped glow read as nothing while the spike's additive glow read as light.
    ...(additive ? { blending: AdditiveBlending, toneMapped: false } : {}),
    depthTest: false,
    depthWrite: false,
    // addLine emits its quad wound by segment direction, so a line running the other way is
    // back-facing. FrontSide culled those quads and left only the round caps, which is why the
    // failure marker's X rendered as four corner blobs with a hole through the middle.
    side: DoubleSide,
    transparent: true,
    uniforms: texture ? { map: { value: texture } } : {},
    vertexShader: `
      attribute vec4 tint;
      varying vec2 vUv;
      varying vec4 vTint;
      void main() {
        vUv = uv;
        vTint = tint;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: texture ? `
      uniform sampler2D map;
      varying vec2 vUv;
      varying vec4 vTint;
      void main() {
        vec4 sampled = texture2D(map, vUv);
        gl_FragColor = sampled * vTint;
        ${legacyColorTransform}
        if (gl_FragColor.a <= 0.001) discard;
        ${additive ? '' : '#include <tonemapping_fragment>'}
        #include <colorspace_fragment>
      }
    ` : `
      varying vec4 vTint;
      void main() {
        gl_FragColor = vTint;
        ${legacyColorTransform}
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function updateGeometry(geometry: BufferGeometry, data: GeometryData): void {
  const sameSize = geometry.getAttribute('position')?.count === data.positions.length / 3 &&
    geometry.getIndex()?.count === data.indices.length;
  if (!sameSize) {
    geometry.dispose();
    geometry.setAttribute('position', new Float32BufferAttribute(data.positions, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(data.uvs, 2));
    geometry.setAttribute('tint', new Float32BufferAttribute(data.tints, 4));
    geometry.setIndex(new Uint32BufferAttribute(data.indices, 1));
  } else {
    (geometry.getAttribute('position') as Float32BufferAttribute).copyArray(data.positions);
    (geometry.getAttribute('uv') as Float32BufferAttribute).copyArray(data.uvs);
    (geometry.getAttribute('tint') as Float32BufferAttribute).copyArray(data.tints);
    (geometry.getIndex() as Uint32BufferAttribute).copyArray(data.indices);
    geometry.getAttribute('position').needsUpdate = true;
    geometry.getAttribute('uv').needsUpdate = true;
    geometry.getAttribute('tint').needsUpdate = true;
    if (geometry.getIndex()) geometry.getIndex()!.needsUpdate = true;
  }
  geometry.setDrawRange(0, data.indices.length);
}

/**
 * Handoff technique 7: light falls off in discrete plateaus, not a smooth ramp.
 *
 * A continuous gradient puts a smooth ramp into a quantised image, which is the one thing the art
 * direction avoids everywhere else. The spike quantised its glow instead, and that is what made
 * its light belong to the same picture as its sprites.
 *
 * Each pair is [outer radius as a fraction of the texture, alpha across that band]. The spike's
 * FOUR steps are kept; the spike's ALPHAS are not. It ran 0.04 to 0.12 against production's centre
 * of 1, so importing them would recreate the "glow reads as nothing" bug the additive-glow work
 * fixed. These sample production's own falloff envelope, so the light keeps its current strength
 * and only its shape becomes stepped.
 *
 * The last pair is explicitly [1, 0]. The district pools sample this texture through the fan of
 * `addEllipse`, whose rim sits exactly on the radius-1 circle, so any alpha left at the rim would
 * draw a hard ring around every pool.
 */
export const GLOW_PLATEAUS: readonly (readonly [number, number])[] = [
  [0.22, 1],
  [0.46, 0.52],
  [0.70, 0.24],
  [0.90, 0.08],
  [1, 0],
];

/** Alpha at a radius, as a fraction of the glow texture's radius. Pure, so it is testable. */
export function glowPlateauAlpha(radiusFraction: number): number {
  for (const [outerRadius, alpha] of GLOW_PLATEAUS) {
    if (radiusFraction <= outerRadius) return alpha;
  }
  return 0;
}

function generatedGlowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The generated glow canvas is unavailable.');
  // Built from a gradient with PAIRED stops rather than per-texel writes or stacked arcs.
  //
  // Two stops at the same offset make the transition zero-width, so the result is exact plateaus
  // and not a ramp. Stacked filled arcs would blend at every boundary under source-over and hand
  // back the soft edge this technique removes, and a per-texel ImageData write needs more of the
  // canvas API than the renderer's own tests provide.
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  let innerRadius = 0;
  for (const [outerRadius, alpha] of GLOW_PLATEAUS) {
    gradient.addColorStop(innerRadius, `rgba(255, 255, 255, ${alpha})`);
    gradient.addColorStop(outerRadius, `rgba(255, 255, 255, ${alpha})`);
    innerRadius = outerRadius;
  }
  context.fillStyle = gradient;
  context.beginPath();
  // The pools' fan rim sits on the radius-32 circle, so fill to 32 or every pool fades early.
  context.arc(32, 32, 32, 0, Math.PI * 2);
  context.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // Nearest, so the plateaus stay plateaus. Linear sampling would interpolate across every band
  // boundary and hand back the smooth falloff.
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  return texture;
}

export type ThreeRendererEvidence = Readonly<{
  rendererKind: 'threejs-2d';
  webgl2: true;
  toneMapping: ToneMappingKind;
  explicitSort: true;
  legacyColorParity: boolean;
  drawCalls: number;
  atlasDrawCalls: number;
  textures: number;
  materials: number;
  geometries: number;
  gpu: Readonly<{
    drawCalls: number;
    geometries: number;
    programs: number;
    textures: number;
  }>;
  atlasSize: Readonly<{ width: number; height: number }>;
  atlasSampling: Readonly<{
    magFilter: 'nearest';
    minFilter: 'nearest';
    generateMipmaps: false;
    anisotropy: 1;
    wrapS: 'clamp-to-edge';
    wrapT: 'clamp-to-edge';
  }>;
  presentedZoom: number | null;
  trianglesByBatch: Readonly<Record<string, number>>;
}>;

export class ThreeWorldRenderer {
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera = new OrthographicCamera();
  readonly #geometries = new Map<BatchId, BufferGeometry>();
  readonly #meshes = new Map<BatchId, Mesh>();
  readonly #atlasTexture: Texture;
  readonly #glowTexture: CanvasTexture;
  readonly #materials: readonly ShaderMaterial[];
  readonly #atlasWidth: number;
  readonly #atlasHeight: number;
  readonly #matchLegacyColors: boolean;
  #latestFrame?: WorldFrameState;
  #presentedFrame?: WorldFrameState;
  #animationFrame = 0;
  #lost = false;
  #timedOut = false;
  #restorePending = false;
  #ready = false;
  #disposed = false;
  #lossTimer?: ReturnType<typeof setTimeout>;

  private constructor(
    readonly canvas: HTMLCanvasElement,
    renderer: WebGLRenderer,
    atlasTexture: Texture,
    glowTexture: CanvasTexture,
    matchLegacyColors: boolean,
    private readonly onReady: () => void,
    private readonly onContextStateChange: (state: 'lost' | 'restored' | 'timed-out') => void,
  ) {
    this.#renderer = renderer;
    this.#atlasTexture = atlasTexture;
    this.#glowTexture = glowTexture;
    this.#matchLegacyColors = matchLegacyColors;
    const image = atlasTexture.image as Readonly<{ naturalHeight?: number; naturalWidth?: number; height?: number; width?: number }>;
    this.#atlasWidth = image.naturalWidth ?? image.width ?? 1;
    this.#atlasHeight = image.naturalHeight ?? image.height ?? 1;
    const atlasMaterial = shaderMaterial(atlasTexture, matchLegacyColors);
    const primitiveMaterial = shaderMaterial(undefined, matchLegacyColors);
    const glowMaterial = shaderMaterial(glowTexture, false, true);
    // The legacy atmosphere was plain React Native Views composited by the browser as sRGB CSS,
    // never through a Skia surface, so the legacy P3 matrix must not apply to it. Applying it
    // shifted the whole frame by about one count, because the wash covers every pixel.
    const overlayMaterial = shaderMaterial(undefined, false);
    this.#materials = [atlasMaterial, primitiveMaterial, glowMaterial, overlayMaterial];
    const atlasBatches = new Set<BatchId>(['floor-and-ground-detail', 'doors', 'grounded-props-and-characters', 'walls', 'roofs']);
    COMPOSITE_BATCHES.forEach((id, renderOrder) => {
      const geometry = new BufferGeometry();
      const material = atlasBatches.has(id)
        ? atlasMaterial
        : id === 'sprite-shadows' ? atlasMaterial
        : id === 'district-light-pools' || id === 'lamp-glow' ? glowMaterial
          // shelter-shade and district-shadows were React and CSS overlays, never Skia surfaces, so
        // the legacy P3 matrix must not apply to them any more than it does to atmosphere.
        : id === 'atmosphere' || id === 'shelter-shade' || id === 'district-shadows'
          ? overlayMaterial
          : primitiveMaterial;
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = renderOrder;
      this.#geometries.set(id, geometry);
      this.#meshes.set(id, mesh);
      this.#scene.add(mesh);
    });
    canvas.addEventListener('webglcontextlost', this.#handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.#handleContextRestored);
  }

  static async create(
    canvas: HTMLCanvasElement,
    atlasUrl: string,
    matchLegacyColors: boolean,
    onReady: () => void,
    onContextStateChange: (state: 'lost' | 'restored' | 'timed-out') => void,
    toneMapping: ToneMappingKind = 'none',
  ): Promise<ThreeWorldRenderer> {
    const context = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
    });
    if (!context) throw new Error('Three.js requires WebGL 2.');
    const renderer = new WebGLRenderer({ canvas, context, alpha: false, antialias: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = SRGBColorSpace;
    // Stage 4 enables ACES in production. Exposure is a recorded calibration value.
    renderer.toneMapping = toneMapping === 'aces' ? ACESFilmicToneMapping : NoToneMapping;
    renderer.toneMappingExposure = ACES_EXPOSURE;
    renderer.sortObjects = false;
    renderer.setClearColor('#b77945', 1);
    const atlasTexture = await new TextureLoader().loadAsync(atlasUrl);
    atlasTexture.colorSpace = SRGBColorSpace;
    atlasTexture.magFilter = NearestFilter;
    atlasTexture.minFilter = NearestFilter;
    atlasTexture.generateMipmaps = false;
    atlasTexture.anisotropy = 1;
    atlasTexture.wrapS = ClampToEdgeWrapping;
    atlasTexture.wrapT = ClampToEdgeWrapping;
    return new ThreeWorldRenderer(canvas, renderer, atlasTexture, generatedGlowTexture(), matchLegacyColors, onReady, onContextStateChange);
  }

  setFrame(frame: WorldFrameState): void {
    this.#latestFrame = frame;
  }

  start(): void {
    if (this.#animationFrame !== 0 || this.#disposed) return;
    const present = () => {
      try {
        if (!this.#lost && !this.#timedOut && this.#latestFrame) {
          if (this.#presentedFrame !== this.#latestFrame) {
            this.#update(this.#latestFrame);
            this.#presentedFrame = this.#latestFrame;
          }
          this.#renderer.render(this.#scene, this.#camera);
          if (!this.#ready) {
            this.#ready = true;
            this.onReady();
          }
          if (this.#restorePending) {
            this.#restorePending = false;
            this.onContextStateChange('restored');
          }
        }
      } catch (error) {
        this.#timedOut = true;
        this.onContextStateChange('timed-out');
        console.error(`SI_WORLD_THREE_RENDERER_FRAME_FAILURE ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        this.#animationFrame = this.#disposed ? 0 : requestAnimationFrame(present);
      }
    };
    this.#animationFrame = requestAnimationFrame(present);
  }

  evidence(): ThreeRendererEvidence {
    if (this.#atlasTexture.magFilter !== NearestFilter || this.#atlasTexture.minFilter !== NearestFilter ||
        this.#atlasTexture.generateMipmaps !== false || this.#atlasTexture.anisotropy !== 1 ||
        this.#atlasTexture.wrapS !== ClampToEdgeWrapping || this.#atlasTexture.wrapT !== ClampToEdgeWrapping) {
      throw new Error('Atlas sampling contract changed.');
    }
    return {
      rendererKind: 'threejs-2d',
      webgl2: true,
      toneMapping: this.#renderer.toneMapping === ACESFilmicToneMapping ? 'aces' : 'none',
      explicitSort: true,
      legacyColorParity: this.#matchLegacyColors,
      drawCalls: COMPOSITE_BATCHES.filter((id) => this.#geometries.get(id)!.drawRange.count > 0).length,
      atlasDrawCalls: ['floor-and-ground-detail', 'doors', 'grounded-props-and-characters', 'walls', 'roofs']
        .filter((id) => this.#geometries.get(id as BatchId)!.drawRange.count > 0).length,
      textures: [this.#atlasTexture, this.#glowTexture].length,
      materials: this.#materials.length,
      geometries: this.#geometries.size,
      gpu: {
        drawCalls: this.#renderer.info.render.calls,
        geometries: this.#renderer.info.memory.geometries,
        programs: this.#renderer.info.programs?.length ?? 0,
        textures: this.#renderer.info.memory.textures,
      },
      atlasSize: { width: this.#atlasWidth, height: this.#atlasHeight },
      atlasSampling: {
        magFilter: 'nearest',
        minFilter: 'nearest',
        generateMipmaps: false,
        anisotropy: 1,
        wrapS: 'clamp-to-edge',
        wrapT: 'clamp-to-edge',
      },
      presentedZoom: this.#presentedFrame?.camera.zoom ?? null,
      trianglesByBatch: Object.fromEntries(COMPOSITE_BATCHES.map((id) => [id, this.#geometries.get(id)!.drawRange.count / 3])),
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#animationFrame !== 0) cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = 0;
    if (this.#lossTimer) clearTimeout(this.#lossTimer);
    this.canvas.removeEventListener('webglcontextlost', this.#handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.#handleContextRestored);
    this.#geometries.forEach((geometry) => geometry.dispose());
    this.#materials.forEach((material) => material.dispose());
    this.#atlasTexture.dispose();
    this.#glowTexture.dispose();
    this.#renderer.dispose();
  }

  readonly #handleContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.#lost || this.#timedOut) return;
    this.#lost = true;
    this.onContextStateChange('lost');
    this.#lossTimer = setTimeout(() => {
      this.#timedOut = true;
      this.onContextStateChange('timed-out');
    }, 10_000);
  };

  readonly #handleContextRestored = (): void => {
    if (this.#lossTimer) {
      clearTimeout(this.#lossTimer);
      this.#lossTimer = undefined;
    }
    this.#timedOut = false;
    this.#lost = false;
    this.#restorePending = true;
    this.#presentedFrame = undefined;
    this.#atlasTexture.needsUpdate = true;
    this.#glowTexture.needsUpdate = true;
  };

  #set(id: BatchId, data: GeometryData): void {
    updateGeometry(this.#geometries.get(id)!, data);
  }

  #update(frame: WorldFrameState): void {
    const { camera, viewport } = frame;
    const drawingBuffer = threeDrawingBufferSize(viewport, frame.devicePixelRatio);
    this.#renderer.setPixelRatio(1);
    this.#renderer.setSize(drawingBuffer.width, drawingBuffer.height, false);
    const bounds = threeCameraBounds(camera, threeRasterViewport(viewport, frame.devicePixelRatio));
    this.#camera.left = bounds.left;
    this.#camera.right = bounds.right;
    this.#camera.top = bounds.top;
    this.#camera.bottom = bounds.bottom;
    this.#camera.near = -1;
    this.#camera.far = 1;
    this.#camera.updateProjectionMatrix();

    const atlas = (...placements: ReadonlyArray<readonly AtlasPlacement[]>): GeometryData => {
      const data = emptyGeometryData();
      placements.flat().forEach((placement) => addAtlasPlacement(data, placement, this.#atlasWidth, this.#atlasHeight));
      return data;
    };
    // Everything under a roof. The frame splits the same information across two lists — the room
    // the player entered, and every room they have not — so the indoor set is their union.
    const sheltered = shelteredTileKeys([...frame.shelterCells, ...frame.roofedCells]);
    // The ground takes the sun's light through the tint attribute the batch already uploads.
    // Four corner values per quad, interpolated by the rasteriser: no extra draw call, no extra
    // fill, no new program. See src/render/ground-light.ts for why the field is low frequency.
    const sunTint = groundSunTint(frame.lighting.sun);
    const shelteredTint = groundSunTint(frame.lighting.sun, true);
    const groundField = groundVariationField(frame.mapId, frame.mapTiles.width, frame.mapTiles.height);
    const groundCorners = new Float32Array(16);
    const ground = emptyGeometryData();
    [frame.floors, frame.groundDetails].forEach((placements) => placements.forEach((placement) => {
      writeGroundCornerTints(
        groundCorners,
        groundField,
        frame.mapTiles.width,
        frame.mapTiles.height,
        sheltered.has(`${placement.tile.x},${placement.tile.y}`) ? shelteredTint : sunTint,
        placement,
      );
      addAtlasPlacement(ground, placement, this.#atlasWidth, this.#atlasHeight, groundCorners);
    }));
    this.#set('floor-and-ground-detail', ground);
    this.#set('doors', atlas(frame.doors));
    const props = new Map(frame.props.map((placement) => [placement.id, placement]));
    const characters = new Map(frame.characters.map((placement) => [placement.id, placement]));
    const groundedPlacements = frame.groundedOrder.flatMap((entry) => {
      const placement = entry.kind === 'prop' ? props.get(entry.id) : characters.get(entry.id);
      return placement ? [placement] : [];
    });
    // Handoff technique 6. The offset and tint are the spike's, converted from its world units to
    // logical pixels. Every value comes from the placement already in the frame.
    // Props only. Characters already carry a tuned contact shadow with a broad cast, and adding a
    // silhouette copy on top of it ate their readable pixels: the player fell to 0.8959 against a
    // 0.95 floor. Props have no such shadow, so they are where this technique pays.
    const shadowCasters = groundedPlacements.filter((placement) => props.has(placement.id));
    // Rotated by the sun, never stretched by it. See SPRITE_SHADOW_LENGTH.
    //
    // A SHELTERED prop keeps the pre-sun constant instead. The sun cannot reach a table inside the
    // villa, so its silhouette must not swing west at dawn and east at dusk; the constant is the
    // measured offset technique 6 shipped with, so an indoor room looks exactly as it always did.
    const sun = frame.lighting.sun;
    const spriteShadowScale = SPRITE_SHADOW_LENGTH / Math.max(1, sun.shadowLength);
    this.#set('sprite-shadows', atlas(shadowCasters.map((placement) => {
      const indoors = sheltered.has(`${placement.tile.x},${placement.tile.y}`);
      return {
        ...placement,
        color: SPRITE_SHADOW_COLOR,
        opacity: SPRITE_SHADOW_OPACITY,
        worldX: placement.worldX + (indoors ? SPRITE_SHADOW_OFFSET_X : sun.shadowX * spriteShadowScale),
        worldY: placement.worldY + (indoors ? SPRITE_SHADOW_OFFSET_Y : sun.shadowY * spriteShadowScale),
      };
    })));
    this.#set('grounded-props-and-characters', atlas(groundedPlacements));
    this.#set('walls', atlas(frame.walls));
    this.#set('roofs', atlas(frame.roofs));

    const doorWear = emptyGeometryData();
    frame.doorWear.forEach((door) => {
      const horizontal = door.horizontal;
      addLine(doorWear,
        door.worldX + (horizontal ? 5 : 24), door.worldY + (horizontal ? 29 : 6),
        door.worldX + (horizontal ? 15 : 27), door.worldY + (horizontal ? 31 : 16),
        2, door.darkColor, true);
      addLine(doorWear,
        door.worldX + (horizontal ? 17 : 27), door.worldY + (horizontal ? 28 : 18),
        door.worldX + (horizontal ? 25 : 25), door.worldY + (horizontal ? 30 : 26),
        1, door.lightColor, true);
    });
    this.#set('door-wear', doorWear);

    const shadows = emptyGeometryData();
    frame.propShadows.forEach((shadow) => {
      const centerX = shadow.worldX + shadow.width / 2;
      if (shadow.long) addLine(shadows, centerX, shadow.worldY, centerX + frame.lighting.shadow.x, shadow.worldY + frame.lighting.shadow.y, 4, frame.lighting.shadow.color, true);
      addRect(shadows, shadow.worldX, shadow.worldY, shadow.width, 4, shadow.color);
    });
    frame.thresholds.forEach((door) => {
      addRect(shadows, door.worldX + 3, door.worldY + 26, 26, 5, door.darkColor);
      addRect(shadows, door.worldX + 6, door.worldY + 26, 20, 1, door.lightColor);
    });
    frame.characterShadows.forEach((character) => {
      addLine(shadows, character.worldX + 5, character.worldY + 1, character.worldX + character.castX, character.worldY + character.castY, 9, frame.lighting.shadow.color, true);
      addEllipse(shadows, character.worldX + 7, character.worldY + 3.5, 11, 3.5, character.color);
    });
    this.#set('contact-shadows-and-thresholds', shadows);

    const selection = emptyGeometryData();
    addEllipse(selection, frame.selectionRing.worldX, frame.selectionRing.worldY, frame.selectionRing.radiusX, frame.selectionRing.radiusY, frame.selectionRing.color, 1, frame.selectionRing.strokeWidth / camera.zoom);
    this.#set('selection-ring', selection);

    const effects = emptyGeometryData();
    frame.effects.forEach((geometry) => geometry.rects.forEach((rectangle) => addRect(
      effects,
      rectangle.x,
      rectangle.y,
      rectangle.width,
      rectangle.height,
      frame.effectRoleColors[rectangle.role],
    )));
    frame.fallbackEffects.forEach((effect) => addEllipse(effects, effect.worldX, effect.worldY, 3, 3, effect.color));
    // Transient one-shots split by layer: ground marks below the characters, aerial marks here.
    const groundEffects = emptyGeometryData();
    frame.transientEffects?.forEach((entry) => addRect(
      entry.layer === 'ground' ? groundEffects : effects,
      entry.x,
      entry.y,
      entry.width,
      entry.height,
      entry.color,
    ));
    this.#set('ground-effects', groundEffects);
    this.#set('effects', effects);

    // The ground's contact with a wall is the cheapest ambient occlusion available: this strip
    // already exists, so the sun only has to lean it and deepen it. Whole pixels, because a
    // fractional strip edge would blur the one hard line the technique depends on.
    // ponytail: crude AO — a real ground edge-mask pass is the upgrade if this reads as a band.
    const wallBaseShiftX = Math.round(sun.shadowX / Math.max(1, sun.shadowLength) * 2);
    const wallBaseDepth = 5 + Math.round((1 - sun.elevation) * 2);
    const wallBases = emptyGeometryData();
    frame.wallBases.forEach((wall) => {
      addRect(wallBases, wall.worldX + 1 + wallBaseShiftX, wall.worldY + 26, 30, wallBaseDepth, wall.darkColor);
      addRect(wallBases, wall.worldX + 3, wall.worldY + 26, 26, 1, wall.lightColor);
    });
    this.#set('wall-bases', wallBases);

    const shelter = emptyGeometryData();
    frame.shelterCells.forEach((cell) => addRect(shelter, cell.x * TILE_SIZE, cell.y * TILE_SIZE, cell.width * TILE_SIZE, cell.height * TILE_SIZE, frame.lighting.shelterShade));
    this.#set('shelter-shade', shelter);

    // Stage 4 owns district lighting on the Three.js path. The legacy overlay drew in screen
    // pixels, so every screen length divides by zoom to reach world units.
    const lighting = frame.lighting;
    const districtShadows = emptyGeometryData();
    lighting.casters.forEach((caster) => {
      const footX = caster.x * TILE_SIZE + TILE_SIZE / 2;
      const footY = caster.y * TILE_SIZE + TILE_SIZE / 2;
      addLine(
        districtShadows,
        footX,
        footY,
        footX + lighting.shadow.x * 1.5,
        footY + lighting.shadow.y * 1.5,
        5,
        lighting.shadow.color,
        true,
      );
    });
    this.#set('district-shadows', districtShadows);

    const pools = emptyGeometryData();
    lighting.pools.forEach((pool) => {
      const centerX = pool.x * TILE_SIZE + TILE_SIZE / 2;
      const centerY = pool.y * TILE_SIZE + TILE_SIZE / 2;
      const radius = pool.radius;
      ([[1.18, 0.58, 0.18], [0.72, 0.34, 0.45], [0.38, 0.17, 0.8]] as const).forEach(
        ([scaleX, scaleY, opacityScale]) => {
          addEllipse(
            pools,
            centerX,
            centerY,
            radius * scaleX,
            radius * scaleY,
            lighting.accent,
            lighting.poolOpacity * opacityScale,
          );
        },
      );
    });
    this.#set('district-light-pools', pools);

    const lampGlow = emptyGeometryData();
    // The spike put its glow ON each lamp sprite, which is what made the room read as lit. The
    // district pools are three fixed points per map and need not sit near the lamps in the room
    // the player is standing in, so lamp props contribute their own glow here.
    //
    // Every value comes from the frame: the prop list, its sprite id and its world position. No
    // new content, no randomness, no clock of its own.
    // Glow is clipped so light cannot arrive from somewhere the player cannot see.
    //
    // An unclipped quad is 88 world pixels wide, so a 44 pixel halo crosses a 32 pixel wall into
    // the next room. Two rules fix that: a lamp under a roof the player has not entered emits
    // nothing, and when the player is inside a room the remaining glow is clipped to that room's
    // cells. Clipping emits the intersection with adjusted UVs, so the falloff stays correct.
    const inCells = (
      cells: readonly Readonly<{ x: number; y: number; width: number; height: number }>[],
      tileX: number,
      tileY: number,
    ): boolean => cells.some((cell) => (
      tileX >= cell.x && tileX < cell.x + cell.width && tileY >= cell.y && tileY < cell.y + cell.height
    ));

    // One clipped additive glow quad. Factored out of the lamp loop so a transient muzzle flash gets
    // the SAME wall clipping: a gun flash must not leak light through a wall any more than a lamp.
    const addClippedGlow = (centerX: number, centerY: number, radius: number, color: string, opacity: number): void => {
      const left = centerX - radius;
      const top = centerY - radius;
      const span = radius * 2;
      const clips = frame.shelterCells.length > 0
        ? frame.shelterCells.map((cell) => ({
          left: cell.x * TILE_SIZE,
          top: cell.y * TILE_SIZE,
          right: (cell.x + cell.width) * TILE_SIZE,
          bottom: (cell.y + cell.height) * TILE_SIZE,
        }))
        : [{ left, top, right: left + span, bottom: top + span }];
      clips.forEach((clip) => {
        const x0 = Math.max(left, clip.left);
        const y0 = Math.max(top, clip.top);
        const x1 = Math.min(left + span, clip.right);
        const y1 = Math.min(top + span, clip.bottom);
        if (x1 <= x0 || y1 <= y0) return;
        addQuad(
          lampGlow,
          [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
          color,
          opacity,
          [(x0 - left) / span, (y0 - top) / span, (x1 - left) / span, (y1 - top) / span],
        );
      });
    };

    frame.props.forEach((prop) => {
      if (!LAMP_SPRITE_IDS.has(prop.sprite)) return;
      if (inCells(frame.roofedCells, prop.tile.x, prop.tile.y)) return;
      addClippedGlow(
        prop.worldX + prop.source.width / 2,
        prop.worldY + prop.source.height / 2,
        LAMP_GLOW_RADIUS,
        lighting.accent,
        lighting.lampGlowOpacity,
      );
    });
    // Transient emitted light rides the same additive batch, material and stepped-plateau texture as
    // the lamps. No new material, no new program, no new draw call.
    frame.transientGlows?.forEach((glow) => {
      addClippedGlow(glow.worldX, glow.worldY, glow.radius, glow.color, glow.opacity);
    });
    this.#set('lamp-glow', lampGlow);

    // Stage 4 owns the atmosphere treatment. The legacy overlay was viewport-relative, so the
    // wash, edge shades, and motes are converted from screen space through the camera.
    const atmosphere = emptyGeometryData();
    const screenRect = (
      sx: number,
      sy: number,
      sw: number,
      sh: number,
      color: string,
      opacity: number,
    ): void => {
      addRect(
        atmosphere,
        camera.x + sx / camera.zoom,
        camera.y + sy / camera.zoom,
        sw / camera.zoom,
        sh / camera.zoom,
        color,
        opacity,
      );
    };
    const width = viewport.width;
    const height = viewport.height;
    screenRect(0, 0, width, height, frame.atmosphere.wash, 1);
    screenRect(0, 0, width, 16, frame.atmosphere.shade, 0.25);
    screenRect(0, height - 22, width, 22, frame.atmosphere.shade, 0.34);
    screenRect(0, 0, 16, height, frame.atmosphere.shade, 0.18);
    screenRect(width - 16, 0, 16, height, frame.atmosphere.shade, 0.18);
    // Reduced motion is the qualified packaged path: fixed opacity and no drift.
    // Otherwise the drift is rebuilt from the controller-sampled timestamp, so the renderer
    // still owns no clock of its own.
    const drift = frame.reducedMotion ? 0 : atmosphereDrift(frame.animationTimestampMilliseconds);
    const moteOpacity = frame.reducedMotion ? 0.28 : 0.18 + drift * 0.54;
    const moteShift = frame.reducedMotion ? 0 : drift * -8;
    ATMOSPHERE_MOTES.forEach(([leftPercent, topPercent]) => {
      screenRect(
        (leftPercent / 100) * width,
        (topPercent / 100) * height + moteShift,
        2,
        2,
        frame.atmosphere.accent,
        moteOpacity,
      );
    });
    this.#set('atmosphere', atmosphere);

    // Stage 4 owns feedback now that the React lighting and atmosphere overlays no longer mount
    // on this path, so these batches composite above them exactly as the locked order requires.
    // Skia drew the ring and pin scaled by zoom, but the failure X in fixed screen pixels.
    // Stage 5: the shared Skia feedback overlay no longer mounts on this path, because keeping it
    // would force the default path to load CanvasKit. Three.js owns lighting and atmosphere since
    // Stage 4, so these batches sit last in the composite order and land above both, exactly as
    // the locked order requires. Skia snapped every anchor to a whole screen pixel via
    // worldToScreen, so the same lattice is reproduced here.
    const snapWorld = (worldX: number, worldY: number): readonly [number, number] => [
      camera.x + Math.round((worldX - camera.x) * camera.zoom) / camera.zoom,
      camera.y + Math.round((worldY - camera.y) * camera.zoom) / camera.zoom,
    ];

    const destination = emptyGeometryData();
    if (frame.destinationPulse) {
      const pulse = frame.destinationPulse;
      const [px, py] = snapWorld(pulse.worldX, pulse.worldY);
      addEllipse(destination, px, py, pulse.radius, pulse.radius, pulse.color, pulse.opacity, 1);
    }
    this.#set('destination-pulse', destination);

    const journal = emptyGeometryData();
    frame.journalMarkers.forEach((marker) => {
      const [footX, footY] = snapWorld(marker.tile.x * TILE_SIZE + 16, marker.tile.y * TILE_SIZE + 29);
      const centerX = footX - 10;
      const centerY = footY - 30;
      addLine(journal, centerX, centerY + 4, footX - 4, footY - 5, 4, marker.darkColor);
      addLine(journal, centerX, centerY + 4, footX - 4, footY - 5, 2, marker.lightColor);
      addEllipse(journal, centerX, centerY, 7, 7, marker.darkColor);
      addEllipse(journal, centerX, centerY, 5, 5, marker.lightColor);
      addEllipse(journal, centerX, centerY, 2, 2, marker.darkColor);
    });
    this.#set('journal-markers', journal);

    const failure = emptyGeometryData();
    if (frame.failureMarker) {
      const marker = frame.failureMarker;
      const [fx, fy] = snapWorld(marker.worldX, marker.worldY);
      const radius = marker.radiusPixels / camera.zoom;
      const strokeWidth = 3 / camera.zoom;
      // Skia antialiased this diagonal, so a hard-edged stroke of the same width fills fewer
      // pixels inside the locked mask, dropping its median below the contrast floor.
      addLine(failure, fx - radius, fy - radius, fx + radius, fy + radius, strokeWidth, marker.color, true);
      addLine(failure, fx + radius, fy - radius, fx - radius, fy + radius, strokeWidth, marker.color, true);
    }
    this.#set('failure-marker', failure);
  }
}
