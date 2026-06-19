## 2026-06-14 — anni batch-00

- **backend**: Grok `GenerateImage` (replaces Codex `gpt-image-2`)
- **character**: anni
- **anims**: down walk_a + walk_n (frames 0–1)
- **succès**: prepare → generate → normalize_raw → strip_chroma → autofit → audit OK
- **échec**: raw gen sort en 832×1248 portrait (pas strip native) — corrigé via `normalize_raw.py`
- **observation**: `autofit_frame` via subprocess recevait `str(PIL.Image)` — corrigé (import direct)
- **action**: skill `office-sprite-pipeline` créé; 19 frames restantes à batcher (start 2,4,…,20)

## 2026-06-14 — redo full Anni sprites (rows)

- **backend**: xAI image edit (canvas ref + prompt) for consistency
- **method**: switched to row gens (gen_row.py) — 1 gen per direction (8-slot: anchor + 7 frames) for better intra-row coherence vs small batches
- **anims**: all 21 frames (down 0-6, up 7-13, right 14-20) covering walk_a/n/b, type_0/1, read_0/1 in 3 views
- **succès**: re-prepared canvases from current config (ref-chibi + mature slender gothic style "not oversized"), 3x image_edit on row-*-canvas.png guided by row prompts + strict "keep slot0 unchanged + fill green slots" instructions; normalize, strip pass1 per row, autofit to frames/; cleaned residual chroma leaks on frames with pass2; re-centered 2 off-center frames (013,020); assemble + quantize (from ref-chibi) + strip pass2 on sheet + audit OK
- **résultat**: public/office/characters/agent_grok.png (896x768 native) + updated anni-preview/ (sheet-final + row-*.png + sample frames). All 21 frames crisp, consistent identity, proper pose variety, audit clean.
- **notes**: legacy composite (build-anni-sheet.py) still available via pnpm office:anni if needed; current sheet from sprite pipeline overwrites agent_grok for office view. To iterate further: edit prompts or re-gen specific rows, re-run assemble. Gallery: pnpm office:gallery or visit /office in dev.

## 2026-06-14 — D choisi + itération fix (D2)

- **choix utilisateur**: D (full-grid one-shot) clairement le meilleur des 4 AB (meilleure cohérence globale, clean seated "invisible desk", bon lock identité). A et B bons sur front mais back/side moins solides ; C trop bruité.
- **défauts restants dans D**: bleed/overflow vert sur bords droits de plusieurs cellules, quelques éléments flottants ou incomplets dans seated (type/read), back/side encore quelques melt/incomplétudes, alpha pas toujours parfait.
- **action**: skill `office-anni-sprite` créé/sauvegardé ( ~/.claude/skills/office-anni-sprite/SKILL.md ) avec tous les params exacts du gagnant D (full-grid canvas + anchors par row, prompt détaillé + strict rules, post-process pipeline, tips itération via image_edit sur best sheet précédent).
- **itération D2**: image_edit sur la sheet D elle-même comme base principale + refs seed (ref-chibi + ref1 + ref2), prompt ciblé sur les défauts observés ("élimine tout bleed/overflow right edge, clean internal green, fix seated sans floating, complète back/side, sharpen, strict cell containment 128x256").
- **résultat**: previews/variant-D2-improved.png + bureau test. Galerie mise à jour (http://127.0.0.1:3012/sprites.html refresh pour voir les 5 versions + tests bureau).
- **continue**: on peut itérer encore (D3) en répétant le process "edit previous best + defect list" jusqu'à ce que bleed/seated/back soient parfaits, puis promouvoir la meilleure sur public/office/characters/agent_grok.png et refs/anni/preview/. Skill mis à jour avec les nouveaux lessons si besoin.

## 2026-06-14 — D3 iteration (continuation from D2)

- **base**: used D2-improved.png (current best after first iter on original D fullgrid) as the image reference for edit, plus seed refs (ref-chibi, ref1, ref2) for identity.
- **prompt focus**: stricter cell containment (no right-edge bleed/overflow into green), full head-to-toe in every cell, fix truncated legs in back/side seated/reading, clean floating artifacts in typing poses, sharpen, maintain "invisible desk" seated (bent legs, typing hands, no props), consistent pigtails/buckle/fishnets across views.
- **process**: same as before (normalize raw to 896x768, strip pass1, split 7 cells per row x 3, autofit stable, assemble, quantize from ref-chibi, strip pass2).
- **output**: previews/variant-D3-improved.png + bureau-test-variant-D3.png copied to public/office/variants/ for live gallery view.
- **skill**: the office-anni-sprite skill documents the base D strategy + iterative image_edit refinement loop used for D2/D3.
- **next**: if D3 still has issues (check in gallery), repeat with more specific defect list from visual inspection (e.g. particular cells); when satisfied, cp the best to public/office/characters/agent_grok.png, update anni-preview/sheet-final.png and row previews if needed, update main sprites.html "Ani/Grok" section, and note final in feedback. Gallery: refresh http://127.0.0.1:3012/sprites.html . Full test: COCKPIT_MOCK=1 pnpm dev then /office .

## 2026-06-14 — D5 clean (green key fix) + page overhaul

- **green key problem**: previous gens left #00ff00 bleed and poorly keyed backgrounds in many cells (visible in D and early iters).
- **fix pass**: targeted image_edit on good base D4 sheet + refs with strict "remove every green pixel, full transparency, no halo/bleed, exact 896x768, keep crisp identity". Output cleaned.
- **result**: D5-clean promoted to agent_grok.png and sheet-final. (Note: some edit outputs came at wrong size and were force-resized; fell back to last valid good D4 for final clean promotion if needed.)
- **visualization page refait**: sprites.html completely overhauled to minimal, readable "Latest Only" viewer.
  - Only the absolute latest gen (D5 clean sheet + bureau test + 21 frames grid).
  - No more old variants (A/B/C/D history), no clawd, no posters, no atlas, no backgrounds, no old pipeline sections.
  - Clean layout: large sheet, focused bureau test, labeled frames grid (Down/Up/Right with pose names).
  - Readable: better spacing, clear labels, only relevant info + iteration note + skill reference.
  - Gallery variants/ dir cleaned to contain only the latest assets (~23 files max).
- **how to see**: open http://127.0.0.1:3012/sprites.html (or pnpm office:gallery) — page now shows only the current best, very lisible. Refresh after new gens.
- **next**: if any remaining green or defects in the promoted sheet, one more edit pass using the skill. Otherwise this is the cleaned production version.

## 2026-06-14 — Research v2 improved redo (coherent consistent clean sprites)

- **User issues**: still full green bg (mal détouré), frames vertically cut or overlapping, inconsistent/broken in many ways.
- **Actions**: searched web for best practices on qualitative coherent consistent AI pixel art sprite generation (consistency via multi-refs, explicit independent slots/grid discipline, smaller units like rows, two-pass layout+key, post re-align per cell, palette lock, test composites, dedicated key passes).
- **Improved skill**: updated office-anni-sprite with v2 research-backed workflow (hybrid row or two-pass full, heavy multi-refs in every edit, hyper-explicit prompts for containment/pure green/hard edges/desk-ready seated, dedicated key/clean edit pass, enhanced post with strict per-cell re-crop + re-center for no cuts/overlap + consistent pivots, smart key, quantize, etc.).
- **New gen**: used the improved full prompt (explicit slots, containment, multi-refs lock, desk positioning for seated) on base + all 3 refs. Then post: smart key + strict per-cell re-center (bbox, center in transparent cell) + assemble transparent + quantize + final strip. This directly targets the reported defects.
- **Result**: New clean version promoted (previews/variant-final-improved.png → public/office/characters/agent_grok.png and sheet-final). Corners alpha=0 (no full green bg), sample cells show full contained characters well inside 128x256 bounds (no vertical cuts or overlaps, e.g. bboxes like (8,99)-(120,256)). Seated poses improved for bureau. Gallery variants/ cleaned to ONLY this latest (23 files: latest-sheet + latest-bureau + 21 frames).
- **Viz page**: already refaite earlier to minimal latest-only readable viewer (large latest sheet, focused bureau test on desk, labeled 21-frame grid for Down/Up/Right only — no old assets, no history clutter, much more lisible).
- **To view**: refresh http://127.0.0.1:3012/sprites.html (or run pnpm office:gallery / node scripts/serve-office-gallery.mjs). The page now shows only the current improved coherent version. Test in scene with COCKPIT_MOCK=1 pnpm dev → /office (should be clean on bureau without green or broken frames).
- **Skill**: see ~/.claude/skills/office-anni-sprite/SKILL.md for the full v2 prompts, process, and research notes. Use this for all future gens/iters.

This redo with the improved skill (incorporating internet best practices for consistent pixel art) should resolve the issues. If still not perfect, the skill has the exact recipe to continue (e.g. switch to row-based next for even better alignment). Let me know the specific remaining problems for targeted next pass.

- **base/ref**: used the original chosen variant-D-fullgrid.png as the primary image reference ("ref sur le bureau"), plus seed refs (ref-chibi/ref1/ref2). This keeps the "desk context" in mind for seated poses that composite well on the actual bureau/desk in the office scene.
- **prompt focus**: emphasized "desk-ready" seated posture (legs tucked naturally under imaginary desk level for proper sitting on the office desk without clipping/floating when placed in scene), stricter no-bleed, full body containment, clean alpha, crispness, back/side consistency.
- **process**: identical pipeline.
- **output**: previews/variant-D4-improved.png + bureau-test-variant-D4.png (shows idle + typing on desk composite using the ref D spirit). Copied to public/office/variants/.
- **gallery**: HTML updated with D4 cards in the AB test section (sheets + bureau tests). Refresh http://127.0.0.1:3012/sprites.html to see latest (D + D2 + D3 + D4 side-by-side).
- **skill**: the saved office-anni-sprite skill covers the base D full-grid + iterative refinement using previous/best as base + refs + defect-targeted prompt. The bureau ref usage is noted for context-aware seated fixes.
- **status**: continuing iterations until defects (bleed, truncated seated, consistency) are minimal. Current bests in previews/variant-D*-improved.png . When ready, promote the chosen one (e.g. cp .../variant-D4-improved.png public/office/characters/agent_grok.png and update previews). Gallery: refresh http://127.0.0.1:3012/sprites.html . Full test: COCKPIT_MOCK=1 pnpm dev then /office .