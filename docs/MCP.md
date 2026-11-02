# MCP server

Stdio transport, thin wrapper over `@aiediting/mcp-tools` (same 32 tools the CLI uses).

```json
{
  "mcpServers": {
    "aiediting": {
      "command": "node",
      "args": ["<repo>/packages/mcp-server/src/bin.ts"]
    }
  }
}
```

From source (no build needed) at Node ≥ 22. Or add to your MCP client config as `aiediting mcp` if the CLI `bin` is linked (pnpm link).

## Tools by group

**project**: `create_project` · `open_project` · `inspect_project` · `validate_project` · `save_project`

**media**: `import_media` (asset id, probed) · `inspect_media` (ffprobe) · `analyze_media` (LUFS, silences, scene cuts) · `generate_thumbnail`

**timeline**: `add_track` · `add_clip` · `trim_clip` · `split_clip` · `move_clip` · `remove_clip` · `change_speed` · `reorder_clips`

**editing**: `add_transition` · `add_effect` · `remove_effect` · `add_text` · `add_subtitle` · `set_keyframe` · `set_transform` · `set_clip_renderer`

**planning**: `plan_video` (brief → timeline + captions; validation enforced)

**rendering**: `render_video` (blocking; ffprobe-verified response) · `render_status` (persisted job records) · `cancel_render`

**engines**: `list_engines` · `check_engine_health` · `get_engine_capabilities`

## Behavior contract

- Tools persist the working project themselves: a call sequence like `create_project → add_clip → validate_project` is stateful per session.
- `render_video` returns the actual measured output (`outputPath,width,height,duration`) or `{status:'failed', error}` — not a JSON-RPC error.
- No shell/eval from project files; re-read [SECURITY](SECURITY.md) for the guarantees.
