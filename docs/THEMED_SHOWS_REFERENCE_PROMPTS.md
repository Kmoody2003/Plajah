# Lantern Garden — reference image prompts

These prompts produce the reference set the Lantern Garden art pass is scored against
(the art fidelity loop: geometry, colour, materials and props, from every camera the show uses).
Generate each at **16:9, 1920×1080 or larger** unless noted.

To keep the set consistent:
- Paste the **shared style block** onto the end of every prompt.
- Keep the same seed or style reference across the set.
- Generate 2–3 variations of each, then keep the one that best matches the others.

## Shared style block (append to every prompt)

> Same back yard in every image: a small suburban back yard at blue-hour dusk, minutes after sunset. Peach-to-rose glow low on the horizon, fading to deep indigo overhead, with the first faint stars. A weathered dark-stained picket fence across the back. Soft rounded silhouettes of mature trees behind the fence. Short, slightly unkempt dark-green lawn. Warm amber paper-lantern light is the main light source; cool moonlight fills from upper left. Photographic realism: 35mm full-frame look, shallow depth of field, gentle film grain, natural bokeh from string lights, no harsh contrast. Quiet, tender, reverent mood. No people. No text, words, logos or watermarks. No modern gadgets.

## The scene, shot by shot (these mirror the show's camera)

**1. Establishing wide (the opening card sits over this)**
> Eye-level wide shot from the back porch looking across the yard. Three parallel lines of twine strung between tall wooden posts, at gently rising heights front to back, each sagging softly in the middle. Round paper lanterns hang along each line in warm cream, amber, peach and soft rose. Between the lanterns hang white instant-film polaroid photographs on longer twine with small wooden clothespins, swaying slightly. A continuous strand of small warm bulb string lights runs along each line. Fireflies glow faintly over the lawn. The center of the frame is calm and slightly darker so a title can sit there.

**2. High crane opening (the first frames of the intro)**
> High-angle view from above and behind the porch, looking down and across the whole yard. The three lantern lines form glowing parallel arcs over the dark lawn. Polaroids are small white rectangles hanging beneath them. The fence and tree silhouettes frame the yard; the dusk sky glows beyond. Reads like a gentle drone shot descending into the garden.

**3. Approach — between the lanterns**
> Medium shot at standing eye level, about two metres from one hanging polaroid. Two out-of-focus paper lanterns frame the edges of the image as large warm glowing orbs. The polaroid hangs in sharp focus at center on a 40 cm length of natural jute twine, held by a small wooden clothespin to the main line above. The polaroid's white border catches warm lantern light on one side and cool moonlight on the other. String-light bokeh across the top.

**4. Polaroid close-up (the moment before full page)**
> Close-up, the polaroid filling about 80% of frame height, perfectly front-on and still. Classic instant-film proportions: square image window, a thicker bottom margin with a short handwritten blue-ink note. Slightly creamy paper with a faint texture, soft warm rim light, and a tiny shadow from the clothespin. The photo inside is a placeholder of a warm family snapshot, softly lit. The background melts into amber bokeh.

**5. Polaroid hanging detail (macro, for materials)**
> Macro detail of the top of a hanging polaroid. Natural jute twine knotted around the main line; a small unfinished-pine clothespin with a steel spring gripping the white polaroid border. The paper edge has a subtle thickness. A paper lantern glows out of focus behind. Shallow depth of field, crisp texture on the wood grain and twine fibers.

**6. Wide breath — the whole garden (mid-show)**
> Wide shot from slightly elevated, about three metres up at the front edge of the lawn. All three lantern lines are visible with dozens of polaroids hanging beneath them. Off to one side, a wooden garden bench angled toward the lines; on the other side, a small round wooden side table with three white pillar candles burning. Terracotta pots with dark-green shrubs and small pale pink, cream and white flowers. Fireflies drift. Peaceful and full.

**7. Bench and candle table (props)**
> Medium shot of a simple slatted wooden garden bench with a low backrest, weathered honey-brown, angled toward the hanging polaroids. Beside the lines, a small round pedestal table with three white pillar candles of different heights, flames steady, wax softly translucent. Warm candlelight pools on the lawn. Lantern bokeh above.

**8. Release — sky lanterns (closing shot)**
> Low-angle wide shot from the lawn looking up past the lantern lines into the deepening indigo sky. A dozen paper sky lanterns rise slowly at different heights, glowing orange-gold from the small flames inside, drifting gently up and to the right. The strung lanterns and polaroids are silhouetted and glowing at the bottom of the frame. Stars appearing. Upper center left calm for a closing line of text.

## Design sheets (for modelling the props)

Render these on a neutral mid-grey seamless background with soft studio light, orthographic-feeling camera, **3:2**.

**9. Paper lantern sheet**
> Product design sheet of round Chinese-style paper lanterns: front view, side view, three-quarter view and a lit-from-inside view. Thin horizontal wire ribs visible through translucent rice paper, a small black metal cap and hook on top, and an open bottom ring. Four colourways side by side: cream, amber, peach, soft rose. Include one shown glowing at night against black.

**10. Polaroid + clothespin sheet**
> Design sheet of an instant-film polaroid print and a wooden clothespin: front, back, edge-on and three-quarter views. Square image area, thicker bottom margin, slightly creamy white paper, rounded corners barely perceptible. Clothespin in unfinished pine with a steel spring, shown open and clipped onto the polaroid. Twine loop detail.

**11. Post and line sheet**
> Design sheet of a rustic wooden garden post (about 3 m, round, dark weathered stain, small iron eye hook at the top). Natural jute twine tied off with a simple knot, and a strand of small warm-white globe string-light bulbs wrapped along the twine. Front view, top detail, knot detail.

## Optional: a motion reference (video)

If you'd rather give a moving reference:

> 20-second slow dolly through the same dusk back-yard lantern garden: start high and wide over the porch, descend to eye level, glide between two glowing paper lanterns toward a hanging polaroid on twine that slowly stops swaying, and hold close on it. Gentle, graceful, no cuts, cinematic 24 fps.

Use it as the timing and feel reference for camera speed and easing.

## Where to put them

Drop the images in `docs/themed-shows/reference/` named `01-establishing.jpg` … `11-post-line.jpg`.
The art pass will place the props from them and score the lab stills (`showLab.stills`) against them from matching camera times.
