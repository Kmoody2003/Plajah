#!/bin/bash
# PUT the 8 sky panoramas to the presigned upload targets (one target per file, in this order), then finalize with creations_finalize_upload.
R="D:/plajah game assets deign from promtps/racer/Nov 15 - 14_22"
FILES=(
 "Clear_blue_sky_texture_map_57b804a0.jpg"
 "Sky_map_during_golden_hour_40b4c40b.jpg"
 "Sunset_sky_map_panorama_e067bd62.jpg"
 "Dusk_skydome_map_with_gradient_f28edae6.jpg"
 "Starry_night_sky_map_488c6f71.jpg"
 "Sunrise_skydome_map_rendering_abadab67.jpg"
 "Overcast_sky_skydome_panorama_add8aa6f.jpg"
 "Stormy_overcast_sky_with_sunbeams_121a1b6f.jpg"
)
IDS=(d8acbd09-079e-4e03-a966-a5d72a7944fc 3955eb11-7cb5-4377-b324-451aa0254f35 955962af-0fa3-41f1-9a53-e325ac3f99b1 fb69fda2-2214-4a64-8269-65eb0f544efb b88c1f82-b8d8-41bf-bee8-0855c7daf33b 9e3b2448-befe-4ec8-8222-a0c97f7a2850 8efe0742-d84f-47b3-8819-d214d2110bfb 2376483d-5b0e-4917-88c1-03bf0a940985)
SIGS=(c9gGmBr_e_UA_FjNhc31hrVOo1aHXRRUXc6VPDg9Sps PB8FCv7bbiZS-cymojKi8nu8fiSb7jqQUPrGppMYi0U yOOOrPb456tmUiWKczZRtkhJiRXu_hvJWrMGHlPRAj4 L413IZf4D0zUkzR6vvPLyx28CBXOkwC0eUNb26b10qA 6GJkgTc_tMFo4Bc2WQgxJIrRV0Lw8mfLXC8ptvIG7bc MwMC_2S78SUCnp3G_yqWYCqa8_eM4tRQZQmeG_KKEhw YYQdy7OchUqJWOtkb0-pgc7lXVg4BjfBT_YFswgGQEU NtD3fhtdDOWZz5Fhpzhfm08ADKwlWbt-J9-zR_n9NGQ)
for i in 0 1 2 3 4 5 6 7; do
  id="${IDS[$i]}"; sig="${SIGS[$i]}"
  url="https://ak-data.magnific.com/app/api/mcp/uploads/proxy/${id}.jpg?path=temp-files%2F${id}.jpg&mime=image%2Fjpeg&user_id=146789744&expires=1794824687&v=1&sig=${sig}"
  code=$(curl -s -o /dev/null -w "%{http_code}" -X PUT -H "Content-Type: image/jpeg" --data-binary @"$R/${FILES[$i]}" "$url")
  echo "$i ${FILES[$i]} -> $code"
done
