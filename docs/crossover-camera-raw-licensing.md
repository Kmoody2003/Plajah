# Crossover camera RAW: SDK licences

Researched 2026-11-01 from each maker's published terms. This is an engineering reading, not legal advice; have counsel confirm anything marked as a decision before shipping.

## Summary

| Format | SDK access | May the app download it after the user accepts? | May we bundle it? | Status in Crossover |
|---|---|---|---|---|
| Blackmagic RAW (.braw) | Free, behind Blackmagic's register-and-accept page | Not without Blackmagic's written OK. Send the user to Blackmagic | Terms allow the API libraries inside our app. Owner's decision | **Works** when Blackmagic's 6.0+ runtime is installed |
| RED R3D (.r3d) | Free download, licence accepted by the developer company | No. Rights sit with the company that accepted, and sharing with third parties is barred | Yes, for redistributable DLLs, under conditions below | Not built |
| ARRIRAW (.ari/.arx) | ARRI Partner Program application | Unknown; assume no. Terms aren't public | Unknown; ask ARRI | Not built |
| Canon Cinema RAW Light (.crm) | No public SDK found | No | No | Not built |

## Blackmagic RAW

Source: the licence shown on [Blackmagic's SDK download page](https://www.blackmagicdesign.com/support/modal/download-with-terms-start/bmd-braw-sdk-2), and the [SDK page](https://www.blackmagicdesign.com/developer/products/braw/sdk-and-software) (6.0, dated 14 Sep 2026).

- **Clause 1.1**: free, revocable, non-transferable licence to build software compatible with Blackmagic products.
- **Clauses 1.1(d) and 1.3**: the API libraries may be sublicensed and distributed in object code to end users, to the extent incorporated in or required by our software. The rest of the SDK may not be passed on.
- **Clause 4.3**: no copying or modifying the SDK, no disassembling or reverse engineering the libraries. The DLL was not disassembled for this work.
- **Clause 6**: we may only say "XXX compatible with Blackmagic Design YYY" or "XXX for Blackmagic Design YYY", and no marks that could confuse.
- **Automatic download**: no clause addresses it, and the download sits behind a registration form with terms. So Crossover opens Blackmagic's page and lets the user install it there.

**What ships now:** nothing of Blackmagic's. Crossover looks for the runtime that Blackmagic RAW, the SDK or DaVinci Resolve installed, or a folder named in `PLAJAH_BRAW_RUNTIME`.

**Open points:**
- Blackmagic's end-user licence covers the runtime as installed by its player and allows use on a single system. Loading that copy from a third-party app on the user's own PC seems consistent with it, but the terms don't say so directly.
- Bundling is allowed on my reading of 1.1(d), and would remove the install step. It needs someone to accept the SDK terms for Plajah and take the libraries from the SDK package.
- `BrawDecoder.cs` declares method slots and interface ids only. They come from Blackmagic's public manual and the 6.0 slot numbers documented in [FilmCraft PR 1954](https://github.com/storytold/filmcraft/pull/1954) (Apache-2.0), because the August 2025 manual predates 6.0's changes. That PR reports the SDK headers carry the Boost licence. I did not confirm this from the SDK itself, since accepting its terms is the owner's call. Check the slots against the official 6.0 `BlackmagicRawAPI.idl` once someone has accepted them.

## RED R3D

Source: [R3D SDK Licence Agreement](https://www.reddigitalcinema.com/legal/red-r3d-sdk-license-agreement), [RED developers](https://www.red.com/developers). Contact RED-r3dsdk@nikon.com.

- **Section 2**: royalty-free and non-transferable, for developing our own programs.
- **Sections 1.9 and 2**: redistributable dynamic libraries may ship only unmodified, only as part of our program, in a private directory used solely by it, under an end-user licence containing the terms in 1.4.
- **Section 2(iii)-(v)**: we alone support customers, may not call the program certified, and may not use RED's name in marketing without written permission.
- **Section 2(vi)**: headers, documentation and static libraries may not be distributed. That rules out publishing SDK headers or SDK-derived declarations in an open repo, so check how this repo is shared first.
- **Section 3.1-3.2**: no reverse engineering, and no sharing with third parties outside section 2.
- **Section 4**: the software and support communications are confidential.
- **Download for the user**: no. The agreement binds the company that accepted, and offers no route for the app to fetch it for someone else. The workable shape is to bundle the redistributable DLLs under section 2.
- The agreement doesn't name the current DLLs, so confirm they count as Redistributable Software when the SDK is in hand.

## ARRIRAW

Source: [ARRI Partner Program](https://arri.com/en/company/the-arri-philosophy/camera-partner-program), [ARRIRAW FAQ](https://arri.com/en/learn-help/learn-help-camera-system/frequently-asked-questions/arriraw-faq).

- The ARRI Image SDK comes through the partner program's application form. Membership is free, though ARRI notes some functions may carry a fee.
- ARRI's pages disagree on the term (two years on the English program page, three on another).
- Redistribution terms aren't public. Plajah would have to apply and read the agreement.

## Canon Cinema RAW Light

- I found no public decode SDK. Canon's [Digital Camera SDK terms](https://asia.canon/en/campaign/developerresources/terms-conditions-for-digital-camera-software-development-kit-sdk) are a different product.
- [Cinema RAW Development](https://in.canon/en/support/0200575702) is end-user software, and Canon's download terms restrict redistribution. It can't be fetched or embedded by us.
- Direct users to Canon's own software for a ProRes or DNxHR master, and ask Canon's professional group whether a partner SDK exists.

## FFmpeg's GPL build

Vendor SDKs must never be linked into the GPL FFmpeg. Crossover keeps them apart: the vendor decoder runs in the app, and raw frames reach `ffmpeg.exe`, a separate process, through a pipe. Have counsel confirm this separation when reviewing the GPL decision already open for the FFmpeg bundle.
