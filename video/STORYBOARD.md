# Storyboard (30 fps, 652 frames, loop 1920x1200)

Starts and ends on the empty background. The page is shown in a window; the camera pushes slowly per shot, the
shot's widgets stay bright while the rest recedes, a lower-third below the window names what is visible.
Shot timing lives in `SHOTS` in `src/Showcase.tsx`.

| Frames | Shot | Lower third |
| --- | --- | --- |
| 0-62 | Title: logo, "Ogma", tagline "Dev-Dashboard für den Arbeitsrechner" | - |
| 60-160 | Overview, slow push | - |
| 160-250 | Kanban board | Kanban: Aufgaben mit Checklisten-Fortschritt |
| 250-330 | Git | Git: Status, Pull, Push, Commit |
| 330-410 | Docker | Docker: Container und Ressourcen |
| 410-510 | Live metrics, graph, cores | CPU, RAM, GPU und Temperatur live |
| 510-600 | Service status and network | Statusseiten und Latenz externer Dienste |
| 608-652 | Outro: logo and name, fade out | - |
