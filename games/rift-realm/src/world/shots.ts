// Elderwood Wilds — every forest shot in the art folders and the camera that reproduces it in the game.
// `art` is relative to D:\plajah game assets deign from promtps\Shooter; `cam` = eye position, the point it looks at, fov.
// Paired screenshots (art | game) are saved under docs/rift-realm-wilds/ by scripts/riftrealm/wilds_shots.mjs.
export interface Shot { id: string; place: string; art: string; title: string; cam: { pos: [number, number, number]; look: [number, number, number]; fov: number }; night?: boolean;
  /** Heights are absolute (inside caves and the Titan Tree); otherwise they are above the ground under each point. */
  abs?: boolean }

const VS = 'void-sanctum-complete/void-sanctum/environment-shots/elderwood-hollow/';
const NOV = 'Nov 15 - 14_43/';

export const SHOTS: Shot[] = [
  // Elderwood Hollow (CF-24 core)
  { id: 'cf24-map', place: 'oak-deck', title: 'CF-24 tactical map (top-down)', art: 'void-sanctum-level-assets/void-sanctum-level-assets/cyber-forest/cf-24-cod-tactical-map-labeled.webp', abs: true, cam: { pos: [2, 190, 30], look: [2, 0, 4], fov: 50 } },
  { id: 'eh02-oak-deck', place: 'oak-deck', title: 'Great Oak deck, rune circle', art: VS + 'eh-02-central-platform.webp', cam: { pos: [14, 16.5, -18], look: [3, 12, -30], fov: 60 } },
  { id: 'eh07-great-oak', place: 'oak-roots', title: 'Great Oak from the ruins', art: VS + 'eh-07-great-oak.webp', cam: { pos: [6, 4, 14], look: [2, 18, -36], fov: 70 } },
  { id: 'eh10-rope-bridge', place: 'west-bridge', title: 'Rope bridge to the West Lookout', art: VS + 'eh-10-rope-bridge.webp', abs: true, cam: { pos: [-12, 14, -40], look: [-50, 12, -56], fov: 62 } },
  { id: 'eh08-atmosphere', place: 'mossy-floor', title: 'Mossy forest floor', art: VS + 'eh-08-atmosphere.webp', cam: { pos: [-40, 1.6, -18], look: [-48, 4, -40], fov: 62 } },
  { id: 'eh09-materials', place: 'oak-deck', title: 'Deck edge: rope, planks, glowcaps', art: VS + 'eh-09-materials.webp', cam: { pos: [-8, 13.6, -16], look: [-12, 12, -22], fov: 55 } },
  // the High Canopy
  { id: 'eh01-aerial', place: 'junction', title: 'Canopy network from above', art: VS + 'eh-01-aerial-layout.webp', abs: true, cam: { pos: [-60, 40, -200], look: [-150, 8, -255], fov: 64 } },
  { id: 'eh05-high-bridges', place: 'junction', title: 'High Junction, five bridges', art: VS + 'eh-05-high-bridges.webp', abs: true, cam: { pos: [40, 32, -185], look: [22, 20.5, -200], fov: 62 } },
  { id: 'eh03-spawn-west', place: 'rune-west', title: 'West Rune Oak spawn', art: VS + 'eh-03-spawn-west-oak.webp', abs: true, cam: { pos: [-166, 15, -143], look: [-152, 13, -158], fov: 62 } },
  { id: 'eh04-spawn-east', place: 'rune-east', title: 'East Rune Oak spawn', art: VS + 'eh-04-spawn-east-oak.webp', abs: true, cam: { pos: [168, 15.6, -163], look: [182, 13.8, -177], fov: 62 } },
  { id: 'eh06-hazard-drops', place: 'ruins-pit', title: 'Broken bridge over the Sunken Ruins', art: VS + 'eh-06-hazard-drops.webp', abs: true, cam: { pos: [-130, 16, -279], look: [-100, -12, -276], fov: 66 } },
  { id: 'eh11-seedpods', place: 'seedpods', title: 'Seedpod Lookout', art: VS + 'eh-11-vine-seedpods.webp', abs: true, cam: { pos: [113, 10.2, -257], look: [122, 9, -266], fov: 60 } },
  { id: 'eh12-combat-deck', place: 'combat-deck', title: 'Combat Deck', art: VS + 'eh-12-combat-framing.webp', abs: true, cam: { pos: [-190, 17, -236], look: [-205, 9, -250], fov: 60 } },
  // Westwood
  { id: 'treehouse-village', place: 'village', title: 'Treehouse Village plaza', art: NOV + 'Treehouse_village_with_rope_bridges_733e0c8d.jpg', abs: true, cam: { pos: [-300, 28, -232], look: [-330, 19, -195], fov: 62 } },
  { id: 'elderwood-hollow-view', place: 'village', title: 'Elderwood Hollow (map key art)', art: 'void-sanctum-complete/void-sanctum/maps/elderwood-hollow.webp', abs: true, cam: { pos: [-358, 25, -234], look: [-330, 19, -195], fov: 66 } },
  { id: 'settlement', place: 'settlement', title: 'Settlement', art: NOV + 'Cyber-forest_settlement_game_level_75606003.jpg', cam: { pos: [-372, 3, -30], look: [-398, 9, -62], fov: 62 } },
  { id: 'glowcap-hollow', place: 'glowcap-hollow', title: 'Glowcap Hollow', art: NOV + 'Dark_fantasy_map_forest_arena_b1c672cc.jpg', cam: { pos: [-420, 4, 236], look: [-420, 0, 200], fov: 64 } },
  { id: 'titan-bunker', place: 'titan', title: 'Titan Tree bunker', art: NOV + 'Cyber-forest_bunker_interior_wal…_48a80ef0.jpg', abs: true, cam: { pos: [-150, 11, 315], look: [-150, -6, 334], fov: 80 } },
  { id: 'titan-ramp', place: 'titan', title: 'Titan Tree spiral ramp (flythrough)', art: 'video:' + NOV + 'Camera_ascending_tree_ramp_interior_c50c0db4.mp4', abs: true, cam: { pos: [-150, -21.7, 315.6], look: [-158, -20, 316.5], fov: 70 } },
  // river, gorge, vale
  { id: 'glowcap-stream', place: 'glowcap-stream', title: 'Glowcap Stream', art: NOV + 'Stream_rushing_through_biolumine…_3dc843e6.jpg', abs: true, cam: { pos: [258, 3.5, 112], look: [244, 0, 160], fov: 68 } },
  { id: 'zone05-outpost', place: 'overlook', title: 'Zone 05 Outpost over the falls', art: NOV + 'Waterfall_overlook_outpost_balco…_acc01d33.jpg', night: true, abs: true, cam: { pos: [266, 5.5, 340], look: [200, -30, 372], fov: 74 } },
  { id: 'sniper-z06', place: 'sniper', title: 'Sniper Nest Z-06', art: NOV + 'Sniper_nest_in_cyber_forest_bd8346db.jpg', abs: true, cam: { pos: [140, 25.5, 433], look: [186, -30, 456], fov: 74 } },
  { id: 'canopy-sniper', place: 'gorge-arena', title: 'High canopy sniper view of the Gorge Arena (flythrough)', art: 'video:' + NOV + 'Cyber-forest_high_canopy_sniper_…_b03dc35a.mp4', abs: true, cam: { pos: [152, 20, 440], look: [188, -46, 462], fov: 60 } },
  { id: 'crystal-vault', place: 'crystal-vault', title: 'Crystal Vault', art: NOV + 'Underground_vault_with_glowing_c…_a7dadabf.jpg', abs: true, cam: { pos: [259, -43.5, 350], look: [276, -44, 356], fov: 70 } },
  { id: 'rift-vault', place: 'rift-vault', title: 'Rift Vault portal (flythrough)', art: 'video:' + NOV + 'Vault_interior_flythrough_1044b249.mp4', abs: true, cam: { pos: [272, -43.6, 334], look: [272, -40, 308], fov: 64 } },
  { id: 'mangrove-mire', place: 'mire', title: 'Mangrove Mire boardwalk (flythrough)', art: 'video:' + NOV + 'Camera_moving_along_mangrove_wal…_dd22227d.mp4', abs: true, cam: { pos: [-266, -45.7, 511], look: [-300, -46.3, 566], fov: 64 } },
  // the Redwood Ruins
  { id: 'portal-plaza', place: 'portal-plaza', title: 'Portal Plaza', art: NOV + 'Bioluminescent_cyber_forest_spaw…_14e53bc1.jpg', cam: { pos: [380, 2, -96], look: [418, 4, -122], fov: 66 } },
  { id: 'circuit-court', place: 'circuit-court', title: 'Circuit Court (flythrough)', art: 'video:' + NOV + 'Camera_moving_through_cyber_forest_35619e14.mp4', abs: true, cam: { pos: [330, 0.3, -251], look: [330, 1, -268], fov: 64 } },
  { id: 'cathedral', place: 'cathedral', title: 'Elder Cathedral nave', art: NOV + 'Firefight_in_cyber_forest_chapel_844b399e.jpg', abs: true, cam: { pos: [233.5, 1.0, -400], look: [235, 7, -443], fov: 64 } },
  { id: 'chapel-flythrough', place: 'cathedral', title: 'Chapel ruin (flythrough)', art: 'video:' + NOV + 'Cyber-forest_chapel_ruin_flythrough_a6facfe4.mp4', abs: true, cam: { pos: [236, 1.2, -405], look: [235, 5, -443], fov: 58 } },
  { id: 'zone10-temple', place: 'zone10', title: 'Zone 10 Temple', art: NOV + 'Bioluminescent_cyber_forest_envi…_e637cd75.jpg', abs: true, cam: { pos: [445, -2.6, -372], look: [445, -1, -392], fov: 66 } },
  { id: 'neon-gate', place: 'neon-gate', title: 'Neon Gate Ruins', art: NOV + 'Neon_grid_forest_ruins_c289e2f7.jpg', cam: { pos: [505, 1.6, -470], look: [505, 4, -510], fov: 66 } },
  { id: 'neon-ruins', place: 'neon-gate', title: 'Neon ruins and falls', art: NOV + 'Cyberpunk_forest_ruins_with_neon_3b8f5a65.jpg', cam: { pos: [490, 2, -466], look: [510, 6, -520], fov: 70 } },
  { id: 'anomaly-shrine', place: 'shrine', title: 'Anomaly Shrine', art: NOV + 'Cyber_forest_central_shrine_arena_4020c768.jpg', abs: true, cam: { pos: [620, 2.5, -214], look: [620, -4, -240], fov: 66 } },
];
