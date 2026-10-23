# Muse brief: the Halo Angel (Ravencrest)

**What it's for:** when the hero is close to death in the Dracula fight, the orbs form a halo and call down an angel. It dives through Dracula with a sword of lightning, stuns him, then hovers in front of the hero and heals them. It's on screen for about 5 seconds and is the most "holy" thing in a very dark, gothic game.

**Deliverable:** one character sheet, the same format as the bridge troll and Dracula sheets.
- Full-body **front**, **back** and **side** views, T- or A-pose, on a flat neutral background.
- Plus a **head close-up**.
- About 2048 px tall, PNG or WebP.
- Put it in `Ravencrest Assets/` as `halo_angel_sheet.webp`.
- The wings can be drawn separately, or folded behind the back in the turnaround views. The game builds its own glowing, animated wings, so the body matters most.

**Design**
- **Figure:** tall, about 2.4 m, an armored warrior-angel rather than a soft cherub. Calm and severe, with a serene face partly hidden by a smooth gold-white helm or mask with a narrow visor.
- **Armor:** pale ivory and white-gold plate over flowing white robes. Etched halo and sunburst motifs, subtle gold filigree, no gore and no black.
- **Robes:** layered, ending in long ragged hems that will read as streaming light in motion.
- **Hands:** right hand empty and open for the sword (the game adds a lightning blade there); left hand gauntleted.
- **Look:** marble and gold under strong top light. Faintly luminous edges are good, but no baked glow or bloom, since the game adds the radiance.
- **Silhouette:** it must read instantly against the storm. A tall, narrow figure with a strong crown or halo line at the head.
- **Tone:** fits the Ravencrest art (painterly, cinematic, the comic and film stills). Holy, not cute.

**Avoid:**
- Text, logos or watermarks.
- Props other than the sword grip.
- Crossing anything over the legs in the turnaround.
- Busy backgrounds.

When it's in the folder, I'll build it on the 4070 with the local image-to-3D pipeline, rig it on the Muse skeleton, and wire it into the halo with the radiant shader, feathered wings and lightning sword.
