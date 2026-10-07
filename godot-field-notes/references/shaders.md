# Shaders (Godot 4.7, spatial and canvas_item)

## 1. `source_color` means linear inside the shader

A sampler or vector uniform with the `source_color` hint is converted from sRGB to **linear** before
your code sees it. sRGB 0.5 arrives as ≈0.21. Two real bugs came from this:

- **Recolouring a cream Labrador to black** while keeping eyes, mouth and nose. The "already dark"
  mask `1.0 - smoothstep(0.12, 0.3, l)` flagged almost the whole coat, because the luminance was
  computed on linear values. Three rounds of threshold tuning didn't help, and the result was
  blotchy with tan streaks.
- **The night sky ~10× too dark**: `uniform vec3 horizon : source_color = vec3(0.055, 0.08, 0.13)`.
  A hand-typed sRGB 0.13 is ≈0.016 linear, and ACES crushed it. The value that finally worked is
  `vec3(0.32, 0.4, 0.58)` (`shaders/night_sky.gdshader:13`).

The fix: measure thresholds in sRGB, output linear (`shaders/dog_coat.gdshader:6, 25-47`):

```glsl
uniform sampler2D source_tex : source_color, filter_linear_mipmap, repeat_enable;

void fragment() {
	vec3 c = texture(source_tex, UV).rgb;
	// los umbrales se miden en sRGB (la textura llega linealizada por source_color)
	vec3 cs = pow(c, vec3(1.0 / 2.2));
	float l = dot(cs, vec3(0.299, 0.587, 0.114));
	// rosado / rojo (lengua, encías): r claramente sobre g y b
	float pink = smoothstep(0.16, 0.26, cs.r - cs.g) * smoothstep(0.2, 0.3, cs.r - cs.b);
	// dentro de las islas de la boca solo se respetan encías y dientes (muy claros), no el pelaje
	float mouth = max(max(in_rect(UV, keep0), in_rect(UV, keep1)), max(in_rect(UV, keep2), in_rect(UV, keep4)));
	float keep = max(pink, mouth * smoothstep(0.8, 0.88, l));
	keep = max(keep, step(distance(UV, eye.xy), eye.z));
	// zonas ya oscuras (nariz, almohadillas, párpados) se dejan, solo un poco más negras
	float dark_src = 1.0 - smoothstep(0.18, 0.32, l);
	// …
	ALBEDO = mix(fur, c, keep);   // output stays linear: mix with c, not cs
}
```

Rules:

- **Colour textures** (albedo, emission) get `source_color`. **Data textures** (masks, roughness,
  normal, opacity) never do: use `hint_default_white`, `hint_normal`, or no hint.
- Hand-typed `source_color` vec3 constants are sRGB. Small (dark) values shrink a lot. Tune them on screen.
- Before writing masks, find out where the UV islands are: dump the albedo texture out of the GLB and look at it.

The dog shader carries three more lessons:

- **A UV rectangle as a "keep" mask catches stray fur triangles** at island edges (white triangles on the
  neck). Use a tight circle for an eyeball (`step(distance(UV, eye.xy), eye.z)`), and inside mouth
  rectangles keep only very bright (teeth) or pink pixels.
- **Recover hair detail after flattening a colour** with a mip high-pass
  (`shaders/dog_coat.gdshader:42-44`):

  ```glsl
  float lb = dot(pow(textureLod(source_tex, UV, 3.5).rgb, vec3(1.0 / 2.2)), vec3(0.299, 0.587, 0.114));
  float hair = clamp((l - lb) * hair_gain, -1.0, 1.0);
  vec3 fur = mix(deep, light, d) * (1.0 + hair * 0.9);
  ```

- **Anti-plastic**: `SPECULAR` ≈0.22 and `RIM` ≈0.22 with `RIM_TINT = 0.8` (`dog_coat.gdshader:49-52`).
  A strong RIM reads as plastic.

## 2. Visualise intermediates instead of tuning blind

When a visual bug survives two parameter changes, render the masks themselves. *(Session technique,
never committed.)*

```glsl
// TEMPORARY, never commit: R = keep mask, G = fur-detail weight, B = dark-source mask
ALBEDO = vec3(keep, d, dark_src);
```

Workflow: copy the shader to a scratch backup, replace the `ALBEDO` line, take one playtest screenshot,
and restore from the backup **in the same command**, so a forgotten debug line can't ship. On the dog this
found the linear-space bug in one screenshot after three blind iterations.

## 3. `ALPHA` in a spatial shader = transparent pipeline

Writing `ALPHA` anywhere in a spatial shader moves the material to the transparent pipeline:
depth-sorted, and per the docs "transparent materials also cannot cast shadows or appear in
`hint_screen_texture` and `hint_depth_texture`". For cut-outs (foliage cards, cloth edges, hair) also
write `ALPHA_SCISSOR_THRESHOLD`. Below the threshold the pixel is discarded and the material stays
opaque and shadowed:

```glsl
ALPHA = a;
ALPHA_SCISSOR_THRESHOLD = alpha_cut;     // shaders/veg_foliage.gdshader:57-58
```

The same pattern is in `shaders/one_skin.gdshader:75-76` and `shaders/news_people.gdshader:48-49`. Use plain `ALPHA` only
for real blending (glass, halos).

## 4. `render_mode unshaded`: write the colour to `ALBEDO`

A CRT TV screen with `render_mode unshaded, cull_disabled` rendered black while writing the picture to
`EMISSION`. In unshaded mode the docs say "Result is just albedo". Write the screen colour to
`ALBEDO` (`shaders/crt.gdshader:2, 28`):

```glsl
ALBEDO = c * scan * flicker * edge * brightness * power;
```

That shader also flips `uv.x` behind a `uniform bool mirror` for a TV seen in a mirror (`crt.gdshader:17-19`).

## 5. Full-screen post-process

The pattern from `scripts/main.gd:131-143`:

```gdscript
func _build_postfx() -> void:
	var fx := CanvasLayer.new()
	fx.layer = 10
	add_child(fx)
	var rect := ColorRect.new()
	rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE      # or it swallows every click
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/postfx.gdshader")
	Night.postfx = mat
	mat.set_shader_parameter("analog", Settings.analog())
	rect.material = mat
	fx.add_child(rect)
```

The layer order used: post-process 10 (and the VHS overlay 10), HUD 11 (so the UI stays sharp and unfiltered),
intro/menus 20, pause 30, trailer UI 50.

`uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;` provides mipmaps, so a
cheap blur is `textureLod(screen_tex, uv, lod)`.

**"Casi no se ve, está demasiado difuminado"** (the user's words: you can barely see, it's far too
blurry). The cause was three stacked blurs: a base mip LOD, extra LOD on R/B for chroma bleed, and wide
halation everywhere. The halation also treated bright *daytime fog* as a light source. The final values
(`shaders/postfx.gdshader:13-15, 46-55`) use a tiny base blur, chroma bleed under 0.002 UV, and halation
only on hot highlights:

```glsl
uniform float soften = 0.18;        // mip de difuminado de base
uniform float halation = 0.45;      // neblina alrededor de las luces
uniform float chroma_bleed = 0.0015; // croma corrido horizontal (VHS)
// …
vec3 glow = tex(uv, 4.0).rgb * 0.5 + tex(uv, 5.5).rgb * 0.5;
float gl = max(max(glow.r, glow.g), glow.b);
vec3 hot = max(glow - vec3(0.55), vec3(0.0));      // only lanterns, flashlight, UFOs
c += hot * smoothstep(0.55, 1.2, gl) * halation * a * vec3(1.0, 0.85, 0.7) * 2.0;
```

One master `analog` uniform (0–1) scales the whole effect and is wired to a Settings slider (default 0.7).
Compare at 0 / 0.7 / 1.0 before asking the user. The first comparison came out as three identical
images, because the playtest couldn't set the static uniform. A `main.set_analog(v)` helper fixed it.

## 6. Custom sky + fog

The custom night sky (stars, Milky Way, textured moon) disappeared, and then the foggy forest rendered
**brighter** than the sky (inverted treeline silhouettes). `Environment.fog_sky_affect` and
`volumetric_fog_sky_affect` default to 1.0 and blend the sky toward the fog colour. Fix
(`scripts/world.gd:114, 118, 135`):

```gdscript
env.volumetric_fog_sky_affect = 0.0
env.fog_sky_affect = 0.0          # the sky shader owns the horizon; tune its `horizon` to match the fog
# …
night_sky.set_shader_parameter("moon_dir", Basis.from_euler(moon.rotation).z)   # sky moon = light direction
```

Distant emissive meshes (UFO spheres, halos) get `disable_fog = true`, or the fog greys them out
(`scripts/night.gd:727, 743`).

## 7. A silhouette that is the real model

The user's complaint about a shader-drawn walker behind paper screens: *"parece que ese alien es falso,
no es el monstruo real"* (it looks like that alien is fake, not the real monster). The fix renders the
real animated creature on a private layer, through an orthographic camera, into a transparent
SubViewport, and the paper shader reads its alpha in world coordinates. From `scripts/shoji_shadow.gd:7, 18-37, 41-64, 78-82`:

```gdscript
const LAYER := 1 << 12

func setup(w: World) -> void:
	world = w
	_vp = SubViewport.new()
	_vp.size = Vector2i(1040, 320)
	_vp.transparent_bg = true
	_vp.render_target_update_mode = SubViewport.UPDATE_DISABLED   # ALWAYS only while walking
	add_child(_vp)
	_cam = Camera3D.new()
	_cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	_cam.keep_aspect = Camera3D.KEEP_WIDTH
	_cam.size = SIZE.x                    # metres covered horizontally
	_cam.cull_mask = LAYER
	_cam.near = 0.05
	_cam.far = 8.0
	_vp.add_child(_cam)
	var env := Environment.new()
	env.background_mode = Environment.BG_CLEAR_COLOR
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color.WHITE
	_cam.environment = env

func walk(from_x: float, to_x: float, seconds: float) -> void:
	creature = OneSubject.new()
	world.add_child(creature)
	# …
	for _i in 4:
		await get_tree().process_frame     # the actor builds its model deferred; relayer after it exists
	_only_on_layer(creature)
	# …
	_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	var mat := world.shoji_mat
	mat.set_shader_parameter("sil_tex", _vp.get_texture())
	mat.set_shader_parameter("sil_rect", Vector4(CENTER.x, CENTER.y, SIZE.x, SIZE.x * float(_vp.size.y) / float(_vp.size.x)))
	mat.set_shader_parameter("sil_mode", 1)

func _only_on_layer(n: Node) -> void:
	for vi in n.find_children("*", "VisualInstance3D", true, false):
		(vi as VisualInstance3D).layers = LAYER
		if vi is GeometryInstance3D:
			(vi as GeometryInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
```

The shader side (`shaders/shoji.gdshader:21-37, 100-119`):

```glsl
uniform sampler2D sil_tex : filter_linear;
uniform int sil_mode = 0;          // 0 = figura dibujada (respaldo), 1 = silueta real (ShojiShadow)
uniform vec4 sil_rect = vec4(-2.5, 1.55, 10.4, 3.2);   // cx, cy, ancho, alto (m)

float real_shadow(vec3 w) {        // x flipped: the camera looks from inside toward +z
	vec2 uv = vec2(0.5 - (w.x - sil_rect.x) / sil_rect.z, 0.5 - (w.y - sil_rect.y) / sil_rect.w);
	if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
		return 0.0;
	}
	vec2 px = vec2(1.5) / vec2(textureSize(sil_tex, 0));     // 5-tap soften = seen through paper
	float a = texture(sil_tex, uv).a * 0.4;
	a += texture(sil_tex, uv + vec2(px.x, 0.0)).a * 0.15;
	a += texture(sil_tex, uv - vec2(px.x, 0.0)).a * 0.15;
	a += texture(sil_tex, uv + vec2(0.0, px.y)).a * 0.15;
	a += texture(sil_tex, uv - vec2(0.0, px.y)).a * 0.15;
	return clamp(a * 1.2, 0.0, 1.0);
}
// fragment():
//   shade = mix(1.0, 0.08, cover * sil_on);
//   ALBEDO = mix(p, wood, w) * mix(1.0, shade, 0.6);
//   BACKLIGHT = mix(vec3(0.85, 0.8, 0.7), vec3(0.0), w) * shade;   // interior light through washi
//   EMISSION = (…) * shade;
```

Caveats:

- The player camera's default `cull_mask` includes layer 13. Clear the bit if the paper isn't opaque.
- Relayer only after the deferred model build (the four `process_frame` awaits above).
- The procedural fallback (`sil_mode = 0`) tied walk phase to distance so feet don't slide.

Anti-aliased procedural lines use the `fwidth` band from `shaders/shoji.gdshader:42-45`:

```glsl
float band(float x, float w) {
	float aa = fwidth(x) * 1.5;
	return 1.0 - smoothstep(w - aa, w + aa, x) + smoothstep(1.0 - w - aa, 1.0 - w + aa, x);
}
```

## 8. Smaller notes

- **Shared code**: `#include "res://shaders/veg_wind.gdshaderinc"` across bark and foliage
  (`veg_bark.gdshader:3`, `veg_foliage.gdshader:7`). Per-instance colour variation comes through `INSTANCE_CUSTOM` from a
  MultiMesh with `use_custom_data = true`.
- **"Chrome" skin from a baked texture**: highlights baked into the albedo read as metal. Use the texture only for
  detail, compress its bright range, and drop Substance metallic maps (`shaders/creature_skin.gdshader`).
