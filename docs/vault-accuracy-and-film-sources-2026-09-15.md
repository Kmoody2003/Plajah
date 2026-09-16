# Vault accuracy audit and regional cinema sources

Checked September 15, 2026.

## Accuracy findings and changes

- The Kennedy record used unrelated numeric Library of Congress image URLs with invented captions. It now uses [catalog item 00652309](https://www.loc.gov/pictures/item/00652309/), depicting his January 20, 1961 inauguration. The purported PDF was actually another JPEG and was removed.
- The Gehrig image resolved to [a Congressional Asian Pacific American Caucus press conference](https://www.loc.gov/resource/ppmsca.38887/). Roosevelt's 1933 image resolved to [an 1848 California illustration](https://www.loc.gov/resource/cph.3a51846/). Those associations were removed. Other unverified curated speech portraits use a neutral recording icon pending individual review.
- The [March on Washington photograph](https://www.loc.gov/resource/ppmsca.03128/) is retained as event context, with no unsupported claim that it is a portrait of King delivering the speech.
- Audiobook timing previously divided total duration by word count, supplied invented introductory words, selected text by title, and reused excerpts for unrelated chapters. These paths were removed.
- Speech/interview timing was not bound to the actual audio file. Plain Library of Congress XML was given fabricated timestamps from reading speed. That XML is now reference text, not a synchronized transcript.
- An asynchronous interview request could replace the new recording's transcript after navigation. Stale results are now discarded. Book text state resets on recording changes.
- Synchronized playback now requires a reviewed alignment with the exact audio URL, chapter number where applicable, provenance URL, and nonoverlapping start/end cues. Silence and preambles do not highlight the first or previous line. Phrase cues do not claim measured word timing.

### Remaining accuracy work

This is a guard against false accuracy, not a claim that the catalog has been fully transcribed and aligned. No existing manually estimated timeline has been certified by this change. Audiobooks without reviewed recording-specific cues use manual reference reading. Speech reference excerpts still need comparison against each recording for completeness and wording. Unverified historical essays and acquisition/accession claims have not undergone a complete historical audit.

To enable synchronization for a recording, obtain its exact audio file and edition, transcribe/align that file, verify opening/middle/closing cues and pauses, and attach `audioAlignment` with `audioUrl`, `sourceUrl`, `reviewed`, `chapterIndex` for books, and `{start,end,text,speaker?}` cues. A translation, abridgement, different narrator, or combined chapter requires a different alignment. A global time offset cannot repair missing paragraphs or a different edition.

## Regional cinema: acquisition prospects

The existence of a public archive or a free player does not establish redistribution permission. The table distinguishes promising material from a ready-to-ingest collection. No regional films were downloaded or published during this research.

| Region | Repository | What the checked source supports | Platform path |
| --- | --- | --- | --- |
| China | [Wikimedia Commons: Laborer's Love (1922)](https://commons.wikimedia.org/wiki/File:Laborer's_Love_(1922).webm) | The actual video file page offers a downloadable WebM and identifies it with a Public Domain Mark. It is a 22-minute silent film with English intertitles. | Strong first acquisition candidate. Preserve file-level attribution, edition details, and rights evidence; test the actual file before ingest. |
| China | [China Film Archive services](https://www.cfa.org.cn/cfa/ljwm/fw/index.html) | National archive holding films and related records; the service page does not establish a public-domain bulk download license. | Catalog research and institutional access; no automatic ingestion from this evidence. |
| Japan | [National Film Archive of Japan online services](https://www.nfaj.go.jp/english/onlineservice/) | Early animation, Meiji films and historical footage are available online. [Reuse terms](https://www.nfaj.go.jp/onlineservice/contents_use/) require permission and paid procedures for downloading/reusing supplied imagery; streaming use is distinguished. | Link to official viewing; obtain material through its stated reuse process for hosting. Search separately for file-level public-domain copies. |
| India | [NFDC–NFAI](https://nfai.nfdcindia.com/introduction.php?catId=VFdwSlBRPT0%3D&patId=VFhjOVBRPT0%3D&rootId=VFhjOVBRPT0%3D) | Archive deposits retain relationships with producers/copyright holders. [NFDC distribution](https://nfdcindia.com/film-distributions/) explicitly offers OTT licensing. [Films Division](https://filmsdivision.nfdcindia.com/citizens-charter.html) sells telecast rights and archival footage. | Licensing and per-film research, not blanket public-domain ingest. Early silent films are a candidate category, but no specific Indian file was cleared in this pass. |
| Thailand | [Thai Film Archive library/services](https://www.fapot.or.th/main/library) | Extensive VOD holdings and a copy-request procedure; [screening requests](https://www.fapot.or.th/main/news/893) have an institutional process. | Institutional source/permission route. No bulk public-domain permission found. |
| Brazil | [Cinemateca Brasileira BCC](https://www.bcc.org.br/sobre) | Online audiovisual catalog includes silent films and newsreels. [Terms](https://www.bcc.org.br/termo-de-uso) restrict redistribution by default and direct users to request permission. | High-value research and partnership source; assess individual films rather than scrape the collection. |
| Chile | [Cineteca Nacional / CCLM](https://www.cclm.cl/cclm/quienes-somos/sobre-cineteca-nacional/) | Online heritage cinema. [Terms](https://www.cclm.cl/terminos-y-condiciones-cclm/) restrict reuse on other sites and commercial use without consent. | Official viewing links or separately authorized distribution. |
| Argentina | [Archivo Histórico RTA](https://www.radioytelevision.ar/prensa/servicios-del-archivo-historico-de-rta/) | Audiovisual and sound archive with regulated grants of usage rights; [material request instructions](https://www.archivorta.com.ar/wp-content/uploads/2021/10/INSTRUCTIVO-PARA-EFECTUAR-UNA-SOLICITUD-DE-MATERIAL-DEL-AHRTA.pdf) describe rights/copying charges. | Historical news/TV acquisition via rights request, not a public-domain movie feed. |

Recommendation: begin with a small, file-reviewed Commons collection, including Laborer's Love, while building institution-specific licensing relationships. Store actual host and catalog item separately from country, preserving institution, and restoration credit. Evaluate film, soundtrack, subtitles, and edition together; never copy a public-domain label from the film title to an unreviewed restored file.
