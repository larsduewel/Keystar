# Universe map

Combat → Map renders the real three-dimensional positions from CCP's Static Data Export.
The bundled dataset includes all 8,490 named systems with available positions in the export downloaded on 2026-10-06, including known space, wormholes and special space. Positions are converted from metres to light years without changing their relationships. No live ESI calls are needed to load the map.

Left-drag to rotate; right-drag, middle-drag or Shift-drag to pan. Scroll over the map or use the zoom buttons to zoom; wheel input does not scroll the page. Click a star or select a system through search to center it, with a gentle rotation that fades out and stops on interaction. Reset view restores the overview. Known space is the default view; use the selector for wormholes or the complete dataset. Labels avoid overlapping at overview scale; search and star labels expose system names and security status. Security classes use the displayed highsec boundary (0.45); colors reuse the app's validated chart palette.

The region selector centres and highlights region members without hiding route or jump-range destinations. Region names appear at overview zoom, with system labels at closer zoom. Hover a star or select a system to see its region and security status. Region names and membership also come from the bundled CCP export.

Regenerate the dataset with `python scripts/update-map-data.py` after a CCP universe update. Source: https://developers.eveonline.com/static-data/ and https://developers.eveonline.com/docs/guides/map-data/ . Rendering uses an orthographic 3D projection on canvas, with no external map service or graphics dependency.

Rendering caches geometry and label measurements, batches stars into a bounded set of paths, and coalesces camera input into animation frames without rerendering React. Labels pause during dragging. The canvas uses the full panel width.

## Travel and jump range

The travel planner minimizes gate jumps with breadth-first search over CCP’s exported stargates. It checks each route system through the shared, throttled zKillboard client, with concurrent requests deduplicated and results cached for an hour to respect the source API cache. Up to five pages per system are read; a full final page, missing kill positions, or request failure keeps the result unknown. Red means a kill within 150 km of the entry/exit gate in the last two hours, or a killmail explicitly located at that gate. Green means no evidence in the checked sample, not safe passage: kills can be delayed, unpublished or incomplete. Each result shows its check time and linked killmail evidence. The route uses static gates only, not live wormholes or player bridges.

Jump ranges use exported jumpDriveRange attributes and Jump Drive Calibration: base ranges are 3.5 LY for carriers/dreadnoughts/FAX, 3.75 for command carriers, 3 for supercarriers/titans, 4 for Black Ops/lancers and 5 for jump freighters/Rorquals, multiplied by 1 + 0.2 × skill level. The map ring and system tags indicate geometric reach. Highsec, Pochven and Zarzakh destination restrictions are marked separately; wormhole origins are unavailable. Cyno access, fuel and fatigue are not inferred. The static data refresh script regenerates all four data files together.

Threat Intel system links open /map?system=<id>, focus the chosen system and enable its jump range. In-range map labels and system tags show LY distances from the origin. Selecting a travel route starts a small glowing beam that loops from system to system while the route remains selected. Motion effects respect the reduced-motion preference.

Travel checks frame all route systems around their spatial midpoint and slowly orbit the overview. Manual zoom or drag stops the orbit; Focus route restores it. Reduced-motion preferences disable automatic orbiting. Gate evidence includes observed attacker ship counts and linked character names from those recent gate killmails, counting each identified character once using their latest hull. Unknown hulls remain explicit; this is historical evidence, not a confirmed current fleet. It reuses the existing gate-check requests.
