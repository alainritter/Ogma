# Storyboard (30 fps, 600 frames, loop 1920x1200)

Starts and ends on the empty background. The page is shown in a window; the camera pushes slowly per shot, the
shot's widgets stay bright while the rest recedes, a lower-third below the window names what is visible.
Shot timing lives in `SHOTS` in `src/Showcase.tsx`.

| Frames | Shot | Lower third |
| --- | --- | --- |
| 0-62 | Title: logo, "Ogma", tagline "Dev-Dashboard für den Arbeitsrechner" | - |
| 60-160 | Overview, slow push | - |
| 160-262 | Kanban board | Kanban: Aufgaben mit Checklisten-Fortschritt |
| 262-364 | Git and Docker | Git: Status, Pull, Push, Commit · Docker: Container |
| 364-466 | Live metrics, graph, cores | CPU, RAM, GPU und Temperatur live |
| 466-548 | Service status and network | Statusseiten und Latenz externer Dienste |
| 556-600 | Outro: logo and name, fade out | - |
