# AI asset generation

Use generation only after the free sources come up empty, and only through an
MCP server the user has connected. None of these are free. State the rough
cost before a batch, and generate one asset first and show it before the rest.

Check what is connected by looking at the available tools (names like
`mcp__meshy__…`, `mcp__pixellab__…`). If nothing is connected, don't install
anything yourself: give the user the command below and continue with a
placeholder.

## Which service for what

| Need | Service | Setup (user runs once) |
| --- | --- | --- |
| 3D prop or character from text or an image, with rigging and animation | **Meshy** (official MCP) | `claude mcp add-json meshy '{"command":"npx","args":["-y","@meshy-ai/meshy-mcp-server"],"env":{"MESHY_API_KEY":"msy_…"}}'`. Use `add-json`: `claude mcp add … -- npx -y` fails on Windows. |
| 3D, fast, clean topology | **Tripo** (REST API, community MCP) | key at platform.tripo3d.ai. The `threejs-3d-generator` skill already wraps it. |
| Pixel-art characters in 4 or 8 directions, animations, Wang tilesets, UI | **PixelLab** (hosted MCP) | `claude mcp add --transport http pixellab https://api.pixellab.ai/mcp --header "Authorization: Bearer $PIXELLAB_API_KEY"` |
| Pixel-art sprites, sprite sheets, tilesets | **Retro Diffusion** (hosted MCP) | `claude mcp add --transport http retro-diffusion https://mcp.retrodiffusion.ai/mcp --header "Authorization: Bearer $RD_API_KEY"` |
| Sound effects, voice lines, music | **ElevenLabs** (hosted MCP, OAuth) | `claude mcp add --transport http elevenlabs https://api.elevenlabs.io/v1/mcp`, then authenticate through `/mcp` |
| Scene-dressing in Blender, Poly Haven, Sketchfab or Rodin inside Blender | **blender-mcp** | Blender running, plus `uvx mcp-for-blender install-addon` (the package was renamed from `blender-mcp`) |

The header formats for hosted MCPs change. If a connection fails, check the
provider's MCP docs before retrying.

## Keeping generated assets consistent

- Write one **style block** and reuse it word for word in every prompt:
  palette, outline or no outline, shading, camera angle, pixel size or poly
  budget. Take it from the art direction section in `GDD.md`.
- Generate the **reference asset first** (the player character). Pass it as
  the style or image reference for everything after it, when the service
  supports that.
- **3D**: ask for a low poly budget (under 5k triangles for props in a web
  game), GLB output, and the origin at the feet. Run
  `npx @gltf-transform/cli inspect` on the result, and `optimize` if it's heavy.
- **Sprites**: fix the canvas size (16, 32 or 64 px) and a transparent
  background. Sprite sheets need a stated frame count and layout.
- **Audio**: keep SFX short (under 1 s) and ask for a dry sound with no reverb.
  Normalize loudness across the set.

## Credits for generated assets

Add a row to `assets/credits.json` by hand, then run `node scripts/assets.mjs credits`:

```json
{
  "ref": "generated:meshy-knight",
  "title": "Knight (generated)",
  "type": "model",
  "license": "Meshy output, see plan terms",
  "author": "Meshy (prompted by <user>)",
  "url": "https://www.meshy.ai",
  "paths": ["assets/models/knight.glb"]
}
```

Commercial rights to generated output depend on the user's plan with that
service. Say that once when a generated asset first enters a project.
