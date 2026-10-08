import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// Write the correct choice FIRST; the helper rotates the choices (keeping their cyclic order) so the
// correct answer lands on a spread-out index.
const mc = (l: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], hint: string, explanation: string): Question => {
  const target = (parseInt(l.slice(l.lastIndexOf('.l') + 2), 10) * 3 + n * 5) % 4;
  const shift = target; // correct choice starts at index 0
  const rotated = choices.map((_, i) => choices[(i - shift + 4) % 4]);
  return { id: `${l}.q${n}`, lessonId: l, kind: 'mcq', prompt, choices: rotated, answer: target, hint, explanation, level };
};
const tf = (l: string, n: number, level: 1 | 2 | 3, prompt: string, answer: number, hint: string, explanation: string): Question =>
  ({ id: `${l}.q${n}`, lessonId: l, kind: 'tf', prompt, answer, hint, explanation, level });

const L01 = 'audio-engineering.l01';
const L02 = 'audio-engineering.l02';
const L03 = 'audio-engineering.l03';
const L04 = 'audio-engineering.l04';
const L05 = 'audio-engineering.l05';
const L06 = 'audio-engineering.l06';
const L07 = 'audio-engineering.l07';
const L08 = 'audio-engineering.l08';
const L09 = 'audio-engineering.l09';
const L10 = 'audio-engineering.l10';
const L11 = 'audio-engineering.l11';
const L12 = 'audio-engineering.l12';
const L13 = 'audio-engineering.l13';
const L14 = 'audio-engineering.l14';
const L15 = 'audio-engineering.l15';
const L16 = 'audio-engineering.l16';
const L17 = 'audio-engineering.l17';
const L18 = 'audio-engineering.l18';
const L19 = 'audio-engineering.l19';
const L20 = 'audio-engineering.l20';
const L21 = 'audio-engineering.l21';
const L22 = 'audio-engineering.l22';
const L23 = 'audio-engineering.l23';
const L24 = 'audio-engineering.l24';
const L25 = 'audio-engineering.l25';
const L26 = 'audio-engineering.l26';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'audio-engineering',
    label: 'Audio Engineering',
    blurb: 'From the physics of sound and digital audio to microphones, mixing, mastering, live sound and post-production. Every calculation is worked through so you can check it yourself.',
    accent: '#00DAF3',
    framework: 'ncas',
    tracks: [
      {
        id: 'audio-engineering.t1',
        title: 'Sound, Hearing and Digital Audio',
        blurb: 'What sound is, how we hear it, how decibels work, and how sound becomes numbers.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'What Sound Is',
            blurb: 'Sound is a pressure disturbance travelling through a medium, described by amplitude, frequency and wavelength.',
            minutes: 6,
            body: `Clap your hands. Your palms push on the air between them, squeezing it for an instant. That squeeze spreads outward as a chain reaction: each patch of air bumps the next, so a region of higher pressure (a compression) is followed by a region of lower pressure (a rarefaction). Sound is this pressure disturbance travelling through a medium such as air, water or a solid. Because it needs a medium, sound cannot travel through a vacuum.

Notice what moves and what does not. The air molecules wobble back and forth around where they started; the disturbance itself is what travels to your ear. In air at about 20 degrees Celsius (68 degrees Fahrenheit), sound travels at roughly 343 metres per second. It is faster in warmer air, and much faster in water and in solids.

Two measurements describe a simple sound wave. Amplitude is how large the pressure changes are, and it is closely linked to how loud we perceive the sound. Frequency is how many complete cycles occur each second, measured in hertz (Hz), and it is closely linked to perceived pitch. A third quantity connects them: wavelength, the distance one cycle covers, equals the speed of sound divided by the frequency.

Worked example: a 1,000 Hz tone has a wavelength of 343 / 1,000 = 0.343 metres. A 100 Hz tone has a wavelength of 343 / 100 = 3.43 metres. This is why bass is hard to control in rooms: its waves are as long as the room itself, so they interact with walls in ways short waves do not. Keep this wavelength idea in mind; it returns in microphone placement, room acoustics and live sound.`,
          },
          {
            id: L02,
            title: 'Hearing and Decibels',
            blurb: 'The decibel is a logarithmic ratio; knowing a few anchor values lets you reason about levels, loudness and hearing safety.',
            minutes: 8,
            body: `Healthy young listeners can typically hear from about 20 Hz to 20,000 Hz (20 kHz). This range narrows with age and with exposure to loud sound, so protecting hearing is part of the job, not an extra.

Our ears cope with an enormous range of pressures, so engineers use the decibel (dB), a logarithmic unit. A decibel always compares two values. For quantities like voltage or sound pressure, the difference in dB is 20 times the base-10 logarithm of the ratio. For power it is 10 times the logarithm. Three anchors cover most daily work: doubling a voltage or pressure adds about 6 dB, multiplying it by ten adds 20 dB, and doubling power adds about 3 dB.

When dB is tied to a reference it describes an absolute level. Sound pressure level (dB SPL) uses a reference of 20 micropascals, close to the quietest sound a young, healthy ear can detect at around 1 kHz. So 0 dB SPL is not silence; it is the reference point. As a rule of thumb, a 10 dB increase is heard as roughly twice as loud.

Hearing damage depends on level and time. The U.S. National Institute for Occupational Safety and Health (NIOSH) recommends limiting exposure to 85 A-weighted decibels (dBA) over 8 hours, and halving the time for every 3 dB increase. At 88 dBA that is 4 hours, and at 91 dBA it is 2 hours.

Finally, the ear is not equally sensitive at all frequencies, especially at low listening levels, when bass and extreme treble seem to fade. That is why engineers check mixes at more than one volume.`,
          },
          {
            id: L03,
            title: 'Waveforms, Harmonics and Phase',
            blurb: 'Real sounds are a fundamental plus harmonics; timbre, pitch and cancellation all follow from this picture.',
            minutes: 7,
            body: `A waveform is a graph of pressure against time. The simplest is the sine wave, which contains a single frequency and nothing else. Real instruments are richer: a played note consists of a fundamental frequency plus harmonics, which are whole-number multiples of it. If the fundamental is 220 Hz, the second harmonic is 440 Hz, the third is 660 Hz, and so on.

The balance of harmonics, together with how the sound begins and fades (its envelope: attack, decay, sustain, release), gives each instrument its timbre. That is why a violin and a flute playing the same note at the same loudness still sound different. Common synthesizer shapes illustrate the idea: a square wave contains the fundamental plus only odd harmonics, while a sawtooth contains all of them.

Pitch and frequency are linked logarithmically. Doubling the frequency raises the pitch by one octave. Standard concert pitch places the A above middle C at 440 Hz, so 220 Hz and 880 Hz are the A notes an octave below and above.

Phase describes where a wave is within its cycle, measured in degrees. When two identical sine waves are combined with a 180 degree offset, every peak meets a trough and they cancel, leaving silence. In real recordings the cancellation is partial and varies with frequency, which produces a thin or hollow tone. Polarity inversion, the button marked with a circle and a slash, flips a signal upside down. Summing a signal with an inverted copy of itself gives silence, which is a handy test of whether two files are truly identical.`,
          },
          {
            id: L04,
            title: 'Sampling and the Nyquist Limit',
            blurb: 'Digital audio measures the wave many times per second; the sample rate sets the highest frequency that can be captured.',
            minutes: 8,
            body: `A computer cannot store a smooth, continuous wave, so an analog-to-digital converter (ADC) measures it at regular instants. Each measurement is a sample, and the number taken each second is the sample rate. Audio CDs use 44,100 samples per second (44.1 kHz). Video and film work commonly uses 48 kHz, and 88.2, 96 and 192 kHz are also used.

The Nyquist theorem says the highest frequency that can be captured is half the sample rate. At 44.1 kHz that is 22,050 Hz, which covers the 20 kHz limit of human hearing. At 48 kHz it is 24,000 Hz.

What if a frequency above that limit reaches the converter? It does not vanish; it is misread as a lower frequency, a distortion called aliasing. The alias lands at a distance below the limit equal to how far the tone sits above it. Worked example: sampled at 44.1 kHz, a 30 kHz tone is misrepresented as 44.1 - 30 = 14.1 kHz, a sound that was never in the room. To prevent this, converters use an anti-aliasing filter that removes content above the Nyquist frequency before sampling.

A common misconception is that digital audio is a staircase. When properly converted back to analog, the samples reconstruct the original band-limited wave smoothly, with no stair steps. Higher sample rates are used for reasons such as lower processing latency and extra headroom for some effects; whether they change what listeners can hear is debated, and the 20 kHz limit is the same for every rate.`,
          },
          {
            id: L05,
            title: 'Bit Depth, Dither and Bit Rate',
            blurb: 'Bit depth sets the number of amplitude levels and the noise floor; bit rate describes how much data flows each second.',
            minutes: 8,
            body: `Each sample is stored as a number, and the bit depth is how many binary digits that number has. An N-bit sample can take 2 to the power N values. So 16-bit audio has 65,536 possible levels and 24-bit audio has 16,777,216. Each added bit gives about 6.02 dB of theoretical dynamic range, so 16-bit offers roughly 96 dB and 24-bit roughly 144 dB. Bit depth therefore sets how far down the noise floor of the digital system sits; it does not change the highest frequency captured.

When a recording is reduced to a lower bit depth, for example from 24 to 16 bits for a CD, rounding errors occur that correlate with the music and can sound like gritty distortion on quiet passages. Dither is a very small amount of random noise added just before the reduction, which turns that distortion into a steady, much less objectionable hiss. Apply dither once, at the final reduction, not at every stage. Many programs process internally in 32-bit floating point, which offers vast headroom.

Bit rate is the amount of data per second. For uncompressed PCM audio: sample rate x bit depth x number of channels. Worked example: CD audio is 44,100 x 16 x 2 = 1,411,200 bits per second, or 1,411.2 kbps. Divide by 8 for bytes: 176,400 bytes per second, which is 10,584,000 bytes, or about 10.6 MB, per minute. A 48 kHz, 24-bit stereo recording runs at 48,000 x 24 x 2 = 2,304,000 bits per second, or 2,304 kbps.`,
          },
        ],
      },
      {
        id: 'audio-engineering.t2',
        title: 'Microphones, Signal Flow and Gain',
        blurb: 'How microphones work, where to put them, and how signal travels from source to speaker.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L06,
            title: 'Microphone Types',
            blurb: 'Dynamic, condenser and ribbon microphones convert pressure to voltage in different ways, with different strengths.',
            minutes: 6,
            body: `A microphone is a transducer: it converts sound pressure into a small electrical voltage. The three main types do this differently.

A dynamic microphone attaches a thin diaphragm to a coil of wire that moves in a magnetic field, generating voltage by induction. Dynamics are rugged, need no power, and tolerate very high sound levels, so they are the usual choice for close-miking loud sources such as snare drums and guitar amplifiers, and for handheld stage vocals.

A condenser (capacitor) microphone uses a diaphragm placed close to a fixed backplate, forming a capacitor whose capacitance changes as the diaphragm moves. It needs electrical power for its circuitry, normally 48 volts of phantom power sent from the preamp or interface down the same XLR cable, or sometimes a battery. Condensers are generally more sensitive and capture fine detail and high frequencies, which suits vocals, acoustic instruments and room sound in the studio. Large-diaphragm models are often chosen for vocals and small-diaphragm models for precise sources such as cymbals or acoustic guitar.

A ribbon microphone suspends a very thin metal ribbon in a magnetic field. Ribbons are often described as smooth and natural sounding, and many have a figure-8 pattern. They can be delicate, and handling or very strong air blasts may damage a ribbon. Some ribbon models can also be damaged by phantom power depending on design and wiring, so always follow the manufacturer's guidance.

Example: for a close-miked snare in a loud rock session, a dynamic microphone is a dependable first choice.`,
          },
          {
            id: L07,
            title: 'Polar Patterns',
            blurb: 'A polar pattern describes how a microphone responds to sound arriving from different directions.',
            minutes: 6,
            body: `Microphones do not hear equally in all directions. The polar pattern shows sensitivity as a function of the angle from which sound arrives, where 0 degrees is straight in front of the capsule.

An omnidirectional microphone responds equally from all directions. It picks up a lot of the room, and, because it is a pressure-type design, it has no proximity effect (the bass boost that directional microphones show up close; see the next lesson).

A cardioid microphone, named for its heart-shaped pattern, is most sensitive at the front, less at the sides and least at the rear, directly behind the capsule. This makes it the standard for live stages and studios because it helps reject sound from behind, such as a monitor wedge or another instrument. Supercardioid and hypercardioid patterns are narrower at the front but gain a small area of sensitivity at the rear.

A figure-8 (bidirectional) microphone is equally sensitive to the front and back and almost deaf to sound arriving from the sides, at 90 degrees. Figure-8 capsules are used in stereo techniques such as mid-side and for isolating a source with the null aimed at a problem.

Worked example: a drummer's tom is picked up by its own mic, but the loud hi-hat next to it leaks in. That leakage is called bleed. Choosing a tighter pattern and aiming the least sensitive part of the microphone, its null, toward the hi-hat reduces bleed without any processing. Patterns also change with frequency, and sound arriving off-axis is often duller in tone.`,
          },
          {
            id: L08,
            title: 'Microphone Placement and Phase',
            blurb: 'Distance, angle and the use of several microphones change tone, ambience and phase relationships.',
            minutes: 8,
            body: `Where you put a microphone often matters more than which microphone you pick. Moving closer captures more direct sound and less room, giving an intimate, dry result. Moving farther away brings in more room ambience.

Distance also changes level. In an open space, sound from a point source follows the inverse square law: each time you double the distance, the sound pressure level falls by about 6 dB. Directional microphones also show the proximity effect, an increase in low frequencies as the source gets very close, which engineers use for warmth and control with a pop filter to tame plosive bursts of air.

Using more than one microphone on a source introduces a risk. Sound reaches each microphone at slightly different times, and when the signals are summed some frequencies reinforce while others cancel, a pattern called comb filtering that sounds thin or hollow. A well-known guideline is the 3:1 rule: place a second microphone at least three times as far from the first microphone as the first is from its source. If two singers each stand 20 cm from their mics, keep the mics at least 60 cm apart.

For stereo recording, three common arrangements are a spaced pair (A/B), a coincident pair such as X/Y with capsules at the same point, and ORTF, with cardioids angled at 110 degrees and spaced 17 cm apart. Each captures different time and level differences between the channels, and so a different sense of width. Always listen first; moving the microphone beats fixing it with EQ later.`,
          },
          {
            id: L09,
            title: 'Signal Flow and Signal Levels',
            blurb: 'Signal passes through a chain of stages at different levels; knowing the chain makes problems easy to trace.',
            minutes: 8,
            body: `A typical recording chain is: sound source, microphone, preamplifier, optional processing, ADC, recording software, DAC, power amplifier, loudspeakers. Understanding the order lets you find faults quickly and place processing sensibly.

Signals come at different levels. Microphone level is tiny, on the order of millivolts, so a preamp raises it to line level. In professional gear, nominal line level is +4 dBu, which equals about 1.228 volts RMS. Consumer equipment commonly uses -10 dBV, about 0.316 volts. Instrument level, from an electric guitar pickup, is higher in impedance than a microphone and is usually handled by a direct input (DI) box, which converts it to a low-impedance balanced signal suitable for long cable runs and microphone inputs. Speaker level is high power, meant for loudspeakers only and never for line inputs.

Cables matter too. A balanced connection uses two conductors that carry the signal in opposite polarity, plus a shield. Interference picked up along the cable lands equally on both conductors; the receiving input flips one and sums them, so the noise cancels while the wanted signal is reinforced. This common-mode rejection is why balanced XLR and TRS cables can run long distances quietly. Unbalanced TS cables lack this protection.

Example: if no sound reaches the speakers, trace forward from the source. Is the mic cable seated, phantom power on if needed, preamp gain up, track unmuted, output routed to the right interface output, and monitor volume up? Checking each stage in order is faster than guessing.`,
          },
          {
            id: L10,
            title: 'Gain Staging and Headroom',
            blurb: 'Each stage has a noise floor and a ceiling; good gain staging keeps the signal comfortably between them.',
            minutes: 7,
            body: `Every device in the chain has a noise floor at the bottom and a point where it distorts at the top. Gain staging means setting the level at each stage so the signal stays well above the noise and well below the clipping point. The space between your normal level and the ceiling is headroom.

In digital systems the ceiling is 0 dBFS (decibels relative to full scale), the largest value that can be represented. A fixed-point signal that tries to go higher is clipped flat, which sounds harsh. Analog gear usually distorts more gradually, but it too has limits.

With 24-bit recording the noise floor is so low that you do not need to push levels toward 0 dBFS. A common practice is to let peaks fall roughly between -18 and -6 dBFS, leaving ample room for a surprise loud note. Many studios treat -18 dBFS or -20 dBFS (depending on the standard) as the level that corresponds to 0 VU on an analog meter, which is a convention rather than a law. Peak meters show the instantaneous maximum, while VU and RMS-style meters show an average closer to perceived loudness.

Gain adds in dB. Worked example: a vocal peaks at -18 dBFS, and you raise the preamp by 9 dB. Peaks now reach -18 + 9 = -9 dBFS, still safe.

Two cautions. First, a clipped recording cannot be repaired by turning it down later; lower the gain at the source instead. Second, levels sum: when many tracks play together, the master bus meter climbs, so leave headroom there as well.`,
          },
        ],
      },
      {
        id: 'audio-engineering.t3',
        title: 'Rooms, Recording and Handling Audio',
        blurb: 'Monitoring and room acoustics, running a session, editing, noise control and file formats.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L11,
            title: 'Monitoring and Room Acoustics',
            blurb: 'You can only mix what you can hear accurately, so speaker placement and room behaviour matter.',
            minutes: 8,
            body: `Mix decisions are only as good as what you hear. Studio monitors are loudspeakers designed to reproduce sound as neutrally as possible, and many home studios use nearfield monitors placed fairly close to the listener so the room contributes less. A standard layout puts the two speakers and the listener at the corners of an equilateral triangle, with the tweeters at ear height and angled toward the listening position.

The room still shapes what you hear. Sound reflects from walls, and low frequencies form room modes, also called standing waves, between parallel surfaces. The lowest axial mode between two walls a distance L apart has a frequency of about the speed of sound divided by twice the distance. Worked example: for walls 4 metres apart, 343 / (2 x 4) = about 42.9 Hz. Notes near that frequency will sound boomy in some spots and weak in others.

Acoustic tools do different jobs. Absorbers, such as thick mineral wool panels, soak up energy and reduce reflections. Diffusers scatter sound so a room feels less dead. Bass traps, usually thick absorbers placed in corners where low-frequency pressure builds up, calm the low end. Thin foam mostly absorbs high frequencies and does little for bass. Note also that acoustic treatment, which shapes sound inside the room, is different from soundproofing, which stops sound passing through walls and requires mass, sealing and decoupling.

Headphones remove the room but give an exaggerated stereo image and a different bass experience. Experienced engineers check mixes on monitors, headphones, a car and a phone, because the goal is a mix that translates everywhere.`,
          },
          {
            id: L12,
            title: 'Running a Recording Session',
            blurb: 'Preparation, latency, monitoring, take management and backups keep sessions productive and safe.',
            minutes: 7,
            body: `A smooth session starts before anyone plays. Plan the arrangement, tempo, instrument tuning, and which microphones and inputs go with each source. Create a session in your recording software with a clear folder structure and consistent track names. Decide the sample rate and bit depth at the start; 48 kHz at 24-bit is a common choice for modern projects. Changing the rate later requires conversion and can complicate files that came from different sources.

Performers need to hear themselves. A cue mix, sent to headphones and separate from the control-room mix, lets each player have more of what they need. Latency, the delay between playing and hearing, depends on the buffer size, the number of samples the system processes at once. Delay from one buffer is the buffer size divided by the sample rate. Worked example: 128 samples at 48,000 Hz is 128 / 48,000 = 0.00267 seconds, about 2.67 ms. A larger buffer raises latency but eases the load on the computer, so use a small buffer while recording and a larger one while mixing. Many interfaces also offer direct monitoring, which routes the input to the headphones before the computer.

Record multiple takes, label them, and note good moments so they are easy to find during editing. Keep the room comfortable; the performance matters more than the perfect microphone.

Back up as you go. A widely cited guideline is the 3-2-1 rule: keep three copies of important data, on two kinds of storage, with one copy stored off-site.`,
          },
          {
            id: L13,
            title: 'Editing Audio',
            blurb: 'Non-destructive editing, fades, crossfades and comping assemble the best performance without clicks.',
            minutes: 6,
            body: `Modern recording software edits non-destructively: it stores references to portions of the original audio files rather than rewriting them. You can trim, split, move and undo without altering the recorded file, which stays safe on disk.

A sudden jump in the waveform at a cut produces an audible click, because the signal makes an instantaneous leap. Editors avoid this by placing cuts at zero crossings, where the waveform passes through zero, or by adding a short fade at the start and end of each clip. A crossfade overlaps two clips, fading one out while the other fades in, so that the join is smooth. Fades also help hide changes in background noise.

Comping, short for compiling, is the practice of recording several takes of a part and assembling the best sections from each into one composite performance. Good comping pays attention to timing, pitch, tone and, most importantly, emotional continuity. Timing and pitch correction tools can polish a performance, but heavy correction can introduce artifacts or flatten the life of the music, so use the least that serves the song.

Clip gain adjusts the level of individual pieces before they reach plug-ins. Evening out a loud word in a vocal with clip gain means a compressor later reacts more consistently. In dialogue editing, a recording of the location with no one speaking, called room tone, is used to fill gaps so the background does not drop out.

Example: a singer nails the verse in take two but the chorus in take five. Comp them together, crossfade at a natural pause, and check the join in context.`,
          },
          {
            id: L14,
            title: 'Noise, Hum and Grounding',
            blurb: 'Noise has identifiable causes; understanding grounding and cable practice removes most of it safely.',
            minutes: 7,
            body: `Noise is unwanted sound or electrical interference. Several kinds appear in audio work. Hiss is broadband noise from electronics and sets the noise floor. Hum is a low-pitched tone at the frequency of the mains power, 60 Hz in the United States and 50 Hz in many other countries, often with a harmonic at double that frequency. Buzz is a harsher, harmonic-rich relative of hum, often caused by lighting dimmers or poorly shielded equipment. Radio-frequency interference can add clicks or chatter.

The signal-to-noise ratio (SNR) is the difference in dB between the wanted signal and the noise. Worked example: a signal at -10 dBFS with noise at -70 dBFS has an SNR of 60 dB. A higher SNR is better.

A frequent cause of hum is a ground loop. When two or more pieces of equipment are connected by more than one path to ground, such as through both mains power and a cable shield, a small current can flow around the loop and be heard as hum. Remedies include using balanced connections, plugging related gear into the same properly wired power strip, using a DI box or isolation transformer, and using a ground-lift switch on the audio path where one is provided. Keep audio cables away from power cables, and cross them at right angles if they must meet, to reduce induced noise.

Safety comes first. Never remove or defeat the grounding pin on a power cord to cure hum. That protective ground guards against electric shock, and cures belong in the audio signal path instead.`,
          },
          {
            id: L15,
            title: 'File Formats: Lossless and Lossy',
            blurb: 'Choose uncompressed or lossless formats for recording and mastering, and lossy formats only for final delivery.',
            minutes: 7,
            body: `Digital audio files fall into three families. Uncompressed formats, such as WAV and AIFF, store raw PCM samples exactly as captured. Classic WAV files have a size limit of about 4 gigabytes, which the Broadcast Wave (BWF) variant with RF64 extensions addresses for very long recordings; BWF also stores useful metadata such as timestamps.

Lossless compressed formats, such as FLAC and Apple Lossless (ALAC), shrink the file but decode to a bit-for-bit identical copy of the original, much as a zip file does. They are smaller than WAV but not dramatically so.

Lossy formats, such as MP3, AAC, Ogg Vorbis and Opus, throw away information that models of human hearing suggest is least noticeable, often relying on masking, where louder sounds hide quieter nearby ones. This allows much smaller files, at the cost of permanent changes. How audible those changes are depends on the encoder and the bit rate.

Worked example: CD-quality stereo audio runs at 1,411.2 kbps. A 128 kbps lossy file is about 1,411.2 / 128 = 11 times smaller. A 3-minute song (180 seconds) is 1,411,200 x 180 / 8 = 31,752,000 bytes, about 31.8 MB, as PCM, and 128,000 x 180 / 8 = 2,880,000 bytes, about 2.9 MB, at 128 kbps.

Best practice is to record, edit, mix and archive in lossless or uncompressed formats, and to create lossy copies only at the end for delivery. Re-encoding a lossy file discards more each time, and converting an MP3 to FLAC cannot restore what was thrown away; the file merely becomes a larger container of the same damaged audio.`,
          },
        ],
      },
      {
        id: 'audio-engineering.t4',
        title: 'The Art of Mixing',
        blurb: 'Balance, EQ, compression, space and organisation: how a pile of tracks becomes one record.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L16,
            title: 'Balance and Panning',
            blurb: 'A mix begins with levels and stereo placement that put every element in a clear place.',
            minutes: 7,
            body: `Mixing combines recorded tracks into a finished stereo (or surround) result. The goals are clarity, balance, depth and emotional impact. The most important tool is also the simplest: the fader. Many engineers begin by building a rough static balance with only faders, deciding what matters most (often the vocal, or the kick and bass in dance music), and bringing everything else around it. Reference tracks, professional mixes in a similar style, are useful for checking your balance and tone.

Panning places a sound between the left and right speakers. A mono track panned hard left plays only from the left speaker. Instruments that carry strong low-frequency energy, such as kick drum and bass, are typically kept in the centre, partly because low frequencies carry a lot of energy and centring shares the load evenly between both speakers. Other parts, such as two guitars panned left and right, create width and leave the centre free for the vocal.

Most software uses a pan law: when a mono track sits in the centre, its level is lowered by a small amount, often 3 dB, so that its perceived loudness stays about the same as it moves across the stereo field. Different programs offer different pan laws, so be aware of your setting.

Always check your mix in mono. If two parts partly cancel when summed, for example because of phase problems in stereo effects or multi-microphone recordings, they will shrink or vanish. Mono checks also reveal balance issues on small speakers. Work at moderate volume, take breaks, and trust fresh ears.`,
          },
          {
            id: L17,
            title: 'Equalization',
            blurb: 'EQ shapes tone and carves space so instruments do not mask each other.',
            minutes: 8,
            body: `An equalizer (EQ) changes the level of selected frequency ranges. Common filters include the high-pass filter (low cut), which removes frequencies below a cutoff, and the low-pass filter, which removes frequencies above one. Shelving filters raise or lower everything above or below a corner frequency. A bell, or peaking, filter boosts or cuts around a centre frequency, with Q controlling how narrow it is: a higher Q means a narrower band.

Rough regions help communication, though instruments vary: sub-bass lies below roughly 60 Hz, bass from about 60 to 250 Hz, low mids around 250 to 500 Hz (excess here is often called mud), mids to about 2 kHz, upper mids from roughly 2 to 5 kHz (important for presence and sometimes harshness), and highs above that, with the top range often called air.

Why EQ at all? Mainly to deal with masking, which occurs when one sound obscures another that occupies a similar frequency range. When a guitar crowds a vocal, rather than turning the vocal up, you can reduce the guitar slightly where the vocal lives. This carving makes room for both. A useful habit is to cut problems and boost for character, and to use the least amount that does the job.

Worked example: a vocal recording has low-frequency rumble from a stand. A high-pass filter set around 80 Hz removes it without harming the voice, which has little useful energy that low. The setting depends on the singer.

When comparing an EQ against the bypassed sound, match the levels. A slightly louder version almost always sounds better, which can fool you into keeping a boost that really only added volume.`,
          },
          {
            id: L18,
            title: 'Compression and Dynamics',
            blurb: 'A compressor reduces level above a threshold by a ratio; its timing controls decide how it feels.',
            minutes: 8,
            body: `Dynamic range is the span between the quietest and loudest parts of a performance. A compressor narrows it by turning down the signal when it rises above a set level. The main controls are threshold (the level above which compression begins), ratio (how strongly the overshoot is reduced), attack (how quickly it reacts), release (how quickly it lets go) and make-up gain (a boost afterward to restore overall level).

The ratio is easiest to see with numbers. At 4:1, every 4 dB the input goes over the threshold produces only 1 dB over at the output. Worked example 1: threshold -20 dB, ratio 4:1, input peak -8 dB. The input is 12 dB over; the output is 12 / 4 = 3 dB over, so it comes out at -17 dB, and the gain reduction is 9 dB. Worked example 2: threshold -10 dB, ratio 2:1, input -2 dB. That is 8 dB over, so 4 dB over at the output (-6 dB), and 4 dB of gain reduction.

Timing shapes character. A slower attack lets the initial transient of a drum hit pass through before clamping, which keeps punch. A fast attack tames peaks and can make a sound feel flatter. A very fast release can cause audible pumping, with the background level jumping up and down.

A limiter is a compressor with a very high ratio acting as a ceiling. Other techniques include parallel compression, mixing a heavily compressed copy with the original, and sidechain compression, where another signal, such as the kick, controls the compressor.

Compression is not a loudness switch. Used heavily, it can drain a performance of life, so judge it by ear.`,
          },
          {
            id: L19,
            title: 'Reverb and Delay',
            blurb: 'Time-based effects create space and depth; tempo maths keeps delays musical.',
            minutes: 7,
            body: `Reverb simulates the dense pattern of reflections in a space, adding depth and glue. Key controls include decay time, often described as RT60, the time it takes for the reverb tail to fall by 60 dB; pre-delay, a short gap before the reverb starts, which lets the dry sound speak clearly before the space arrives; size; and damping or EQ, which removes harsh highs or boomy lows. Types include room, hall, chamber, plate and spring, and they can be algorithmic (generated by math) or convolution-based (using recorded impulse responses of real spaces).

A delay repeats a sound after a set time, with feedback controlling how many repeats occur. Delays can be set in milliseconds or synced to the tempo. For a quarter note, the delay time in milliseconds is 60,000 divided by the beats per minute. Worked examples: at 120 BPM a quarter note is 500 ms, an eighth note is 250 ms, and a dotted eighth (1.5 eighths) is 375 ms. At 100 BPM a quarter note is 600 ms. Very short delays, roughly under 30 ms, tend to blend with the original sound rather than being heard as a separate echo.

Practical workflow: use an auxiliary send to feed a single reverb or delay from many tracks, rather than placing the effect on every channel. This keeps a consistent sense of space, saves processing power, and lets you control how much of each track goes to the effect. Filter low frequencies from the effect return to keep the mix clear.

Dry sounds feel close and wet ones feel far away; use that contrast intentionally.`,
          },
          {
            id: L20,
            title: 'Automation, Buses and Stems',
            blurb: 'Automation moves controls over time; buses and stems organise the mix for processing and delivery.',
            minutes: 7,
            body: `A mix is not static. Automation records changes to a control, such as a fader, pan, mute or plug-in parameter, and replays them as the song plays. A classic use is riding a vocal fader up in quiet phrases and down on loud ones, adding detail that compression alone cannot. Common modes are Read (play back existing automation), Write (overwrite as playback runs), Touch (write only while you hold a control, then return to the previous value on release) and Latch (start writing when you touch and continue at the last value until playback stops).

A bus is a path that combines several signals. A group bus, such as a drum bus, sums related tracks so they can be processed together; gentle compression on a drum bus can make the kit sound as if it belongs together, an effect often called glue. An aux bus feeds effects such as reverb, as in the previous lesson. All channels ultimately feed the master bus.

A VCA fader controls the level of assigned channels without summing their audio, so you can move a whole group with one fader while keeping individual levels intact.

A stem is a group of related tracks, such as all drums, all vocals or all music, mixed down into one file. Stems are used for delivery to mastering, for remixes, for film and television, and for live performance backing. Print stems with the same start point and length so they line up when stacked.

Finally, save notes and versions. Clients and artists will ask for revisions, and being able to recall exactly what you did is a professional habit.`,
          },
        ],
      },
      {
        id: 'audio-engineering.t5',
        title: 'Loudness, Mastering and Spatial Audio',
        blurb: 'Measuring loudness, preparing a final master, and sound beyond two speakers.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L21,
            title: 'Loudness, LUFS and True Peak',
            blurb: 'Perceived loudness is measured over time, not by peaks; delivery targets vary by platform and standard.',
            minutes: 8,
            body: `A peak meter shows the highest instant of the waveform, but our sense of loudness follows the average energy over time, weighted by how sensitive the ear is at different frequencies. LUFS (Loudness Units relative to Full Scale, also written LKFS) is a measurement built for this. It follows the ITU-R BS.1770 algorithm, which applies a frequency weighting and a gating process that ignores near-silence. One loudness unit (LU) equals one dB, so a change of 1 dB changes the reading by 1 LU. Meters typically show momentary, short-term and integrated (whole-programme) values.

True peak, in dBTP, estimates the highest level the waveform reaches between samples. After conversion to analog or lossy encoding, these inter-sample peaks can exceed the highest sample value and cause clipping, so many delivery specifications set a true-peak ceiling.

Targets depend on where the audio will play. European broadcast guidance (EBU R128) specifies an integrated loudness of -23 LUFS. In the United States, broadcast television follows ATSC A/85 under the CALM Act, with a target of -24 LKFS. Streaming services apply their own loudness normalization, with targets that differ between services and change over time, so check current specifications before delivery.

Worked example: a master measures -8 LUFS integrated and plays on a service that normalizes to -14 LUFS. The player lowers it by 6 dB (-14 minus -8 is -6). The extra loudness bought by heavy limiting is simply taken back, while the lost dynamics stay lost. This is why the so-called loudness war has lost much of its point.

LUFS tells you how loud, not how good. A number never replaces listening.`,
          },
          {
            id: L22,
            title: 'Mastering Overview',
            blurb: 'Mastering is the final quality check and preparation of audio for distribution.',
            minutes: 7,
            body: `Mastering is the last creative and technical step before release. A mastering engineer, typically in a carefully treated room with accurate monitoring, brings a fresh perspective to a finished mix. The aims are a balanced tone, appropriate loudness, consistency across an album, and files prepared correctly for each format.

Typical tasks include subtle EQ and compression, limiting, adjusting stereo width, setting the order and spacing of songs, fades, and creating the formats required. Consistency matters: if one track on an album plays 4 LU louder than its neighbour, listeners must adjust the volume between songs. The engineer also embeds or supplies metadata. An ISRC (International Standard Recording Code) is a code that identifies an individual sound recording. The Red Book standard for audio CDs is 44.1 kHz and 16-bit stereo, so masters made at higher resolution are converted, with dither, at the end. Disc manufacturing often uses a DDP image file.

Preparing a mix for mastering helps everyone. Common advice:
- leave headroom, such as peaks around -6 dBFS
- avoid heavy limiting or loudness maximizing on the master bus
- deliver at the session sample rate and bit depth in WAV format
- and include notes and a reference if you have one.

If the mix has strong problems, such as a buried vocal, mastering cannot fully fix them, and a revised mix is the correct solution.

Example: an artist delivers ten songs mixed over several months. The mastering engineer matches tone and level between them, sets two-second gaps, and delivers a CD master, a high-resolution WAV and files for streaming.`,
          },
          {
            id: L23,
            title: 'Stereo, Surround and Spatial Audio',
            blurb: 'Stereo, multichannel and object-based formats place sound in space using level, timing and metadata.',
            minutes: 8,
            body: `Mono uses one channel; stereo uses two, left and right. Sounds of equal level in both create a phantom centre between the speakers. Mid-side processing views stereo differently: the mid signal holds what is common to both channels, and the side signal holds the difference. One common convention is mid = (L + R) / 2 and side = (L - R) / 2; scaling varies between tools. Narrowing the side signal reduces width, and a good mix should still work when summed to mono.

We locate sounds partly through two cues: a sound from the left arrives at the left ear slightly sooner (interaural time difference) and slightly louder (interaural level difference), and the shape of the head and ears also filters the sound by direction.

Surround sound adds channels. The 5.1 format has six: left, centre, right, left surround, right surround and a low-frequency effects (LFE) channel, which is the ".1". 7.1 adds more surround channels. Channel-based formats assign sounds to specific speakers. Object-based formats, such as Dolby Atmos, store audio with position metadata, and a renderer in the playback system decides how to reproduce it for the available speakers, whether a cinema array, a soundbar or headphones.

Binaural audio is a two-channel headphone format that reproduces the cues above using head-related transfer functions (HRTFs), creating a convincing sense of direction. Ambisonics represents the full sphere of sound around a point and can be decoded to many layouts.

Example: in a film scene, rain overhead can be placed as an object above the audience, and the renderer adapts it for each venue.`,
          },
        ],
      },
      {
        id: 'audio-engineering.t6',
        title: 'Live Sound, Post-Production and Practice',
        blurb: 'Audio in front of an audience, audio for picture, and working responsibly as an engineer.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L24,
            title: 'Live Sound Basics',
            blurb: 'Live sound adds feedback control, speaker timing and hearing safety to the usual chain.',
            minutes: 8,
            body: `Live sound follows the same chain as recording with extra challenges. Stage microphones connect through a multicore cable (the snake) to the front-of-house (FOH) console, where the engineer mixes for the audience. The mix goes through processors and amplifiers to the main loudspeakers, usually with subwoofers for low frequencies. Performers hear themselves through a separate monitor mix, sent to floor wedges or in-ear systems.

The central problem is feedback. When a microphone picks up sound from a loudspeaker, amplifies it, and sends it out again, a loop forms. If the gain around the loop reaches one or more at some frequency, a ringing howl builds. To maximize gain before feedback: place microphones close to their sources, use directional patterns, aim the quietest part of a cardioid, its rear null, at the monitor wedge, keep speakers pointed away from mics, and lower the level of channels that ring. Engineers also ring out a system by raising gain until a frequency begins to ring and reducing that frequency with an equalizer.

Sound travels about 343 m/s, which matters in large venues. Delay speakers placed partway back should be delayed so their sound lines up with the sound from the stage. Worked example: a delay speaker 34.3 m from the mains needs 34.3 / 343 = 0.1 s, or 100 ms, of delay. Because level falls about 6 dB per doubling of distance, such fill speakers are needed to keep the back of a hall at a similar loudness.

Do a line check and sound check before the audience arrives. And protect hearing: crew and listeners deserve sensible levels and access to hearing protection, and local venue rules may set limits.`,
          },
          {
            id: L25,
            title: 'Audio for Picture: Post, Foley and Sound Design',
            blurb: 'Film and video sound is built in layers and kept in sync with picture.',
            minutes: 8,
            body: `On a film set, production sound is captured with boom microphones and small wireless lavalier mics. In post-production, dialogue editors clean and select the best takes. Where production audio is unusable, actors re-record lines in a studio while watching the picture, a process called ADR (automated or additional dialogue replacement). Editors also record room tone, a minute or so of the location with no one speaking, to fill gaps so backgrounds stay consistent.

Foley is the performance of everyday sounds, such as footsteps, cloth movement and handled props, recorded in sync with picture on a specialised stage. It is named after Jack Foley, an early sound-effects artist at Universal Studios. Sound effects and ambiences come from libraries and field recordings, and music is added. The final mix combines these into stems, commonly dialogue, music and effects, so that a version in another language can be made by replacing only the dialogue.

Sync matters. At 24 frames per second, one frame lasts 1 / 24 of a second, about 41.7 ms. Timecode labels each frame so that sounds can be placed precisely.

Sound design is the creation of sounds that do not exist or cannot be recorded, using layering, synthesis, field recording, and manipulation. Layering a low rumble, a mid-range crackle and a high metallic scrape can build one convincing explosion. Playing a recording at half speed (varispeed) lowers the pitch by one octave and doubles its duration, a quick way to make small things sound enormous.

Dialogue is usually the priority, so music and effects are shaped to leave room for it.`,
          },
          {
            id: L26,
            title: 'Careers, Ethics and Professional Practice',
            blurb: 'Skills, paths, hearing health, consent, credit and rights shape a long career in audio.',
            minutes: 7,
            body: `Audio offers many roles: recording engineer, mixer, mastering engineer, live sound engineer, post-production editor or re-recording mixer, broadcast engineer, sound designer, producer and equipment technician. Most careers start by assisting: learning in a studio, venue or post house, building a portfolio of finished work, and earning trust through reliability. Formal education, short courses and self-study can all help, and none replaces listening practice and communication skills.

Ethics begin with your own ears. Hearing damage from loud sound is permanent, so use hearing protection, take listening breaks and monitor at moderate levels. A career that lasts decades depends on it.

Respect for people and their work follows. Treat unreleased material as confidential. When recording people, get consent; laws on recording conversations differ by place, and some jurisdictions require every party to agree, so check local rules. Agree in writing, before work begins, on fees, deadlines, credits, and who owns the recordings and files. Without an agreement, ownership can be unclear, and arrangements such as work made for hire have specific legal meanings, so this is a place to seek proper advice.

A song recording typically involves two separate copyrights in the United States: one in the sound recording and one in the underlying musical composition. Using a sample of someone else's recording generally requires permission from the rights holders unless a legal exception applies. Rules differ by country and change, and this is general education, not legal advice.

Finally, be honest about your skills and billing, store client files carefully, and credit collaborators.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'audio-engineering',
    questions: [
      // L01
      tf(L01, 1, 1, 'Sound can travel through a perfect vacuum, such as empty space.', 1, 'Think about what the disturbance needs in order to travel.', 'Sound is a pressure disturbance in a medium, so it needs air, water or a solid to travel.'),
      mc(L01, 2, 1, 'Which unit measures frequency?', ['Hertz (Hz)', 'Decibels (dB)', 'Metres per second', 'Volts per metre'], 'It counts cycles each second.', 'Frequency is the number of cycles per second, measured in hertz.'),
      mc(L01, 3, 2, 'Taking the speed of sound as 343 m/s, what is the wavelength of a 500 Hz tone?', ['0.686 m', '1.46 m', '0.343 m', '171.5 m'], 'Wavelength equals speed divided by frequency.', '343 / 500 = 0.686 metres.'),
      mc(L01, 4, 2, 'When you clap, what actually travels from your hands to a listener across the room?', ['A pressure disturbance passed from one patch of air to the next', 'The same air molecules, moving the whole distance', 'A stream of heat only', 'A beam of light that travels from the hands to the ear at the speed of light'], 'Think about what the air molecules do individually.', 'Air molecules only wobble around their positions; the pressure disturbance is what travels.'),
      tf(L01, 5, 3, 'If the speed of sound stays the same, doubling a tones frequency doubles its wavelength.', 1, 'Wavelength equals speed divided by frequency.', 'Doubling the frequency halves the wavelength because the speed is fixed.'),
      // L02
      tf(L02, 1, 1, 'A level of 0 dB SPL means there is no sound at all.', 1, 'Zero in a logarithmic scale is a reference point.', '0 dB SPL is the reference pressure, close to the threshold of hearing, not silence.'),
      mc(L02, 2, 1, 'Roughly how many dB does doubling a voltage or sound pressure add?', ['About 6 dB', 'About 3 dB', 'About 10 dB', 'About 20 dB'], 'The formula uses 20 times a logarithm of the ratio.', '20 x log10(2) is about 6.02 dB.'),
      mc(L02, 3, 2, 'A sound pressure increases by a factor of 10. By how many dB does the level rise?', ['20 dB', '10 dB', '6 dB', '100 dB'], 'Use 20 times the base-10 logarithm of the ratio.', '20 x log10(10) = 20 dB.'),
      mc(L02, 4, 2, 'Using the NIOSH guideline of 85 dBA for 8 hours with time halving for every 3 dB increase, how long is the recommended limit at 91 dBA?', ['2 hours', '4 hours', '1 hour', '6 hours'], 'Count how many 3 dB steps lie between 85 and 91.', '91 is two 3 dB steps above 85, so 8 hours is halved twice, giving 2 hours.'),
      mc(L02, 5, 3, 'Why do engineers often check a mix at several different volumes?', ['Hearing sensitivity to bass and treble changes with listening level', 'Loudness never affects how a mix sounds', 'Speakers only produce sound correctly at one fixed volume, so a mix never needs retesting', 'Decibels cannot be measured at low levels'], 'Think about how the ear responds at quiet levels.', 'The ear is less sensitive to low and very high frequencies at low levels, so balance seems to change with volume.'),
      // L03
      tf(L03, 1, 1, 'Doubling a frequency raises the pitch by one octave.', 0, 'Think of 220 Hz and 440 Hz.', 'An octave corresponds to a frequency ratio of 2:1.'),
      mc(L03, 2, 1, 'A note has a fundamental of 110 Hz. What is its third harmonic?', ['330 Hz', '220 Hz', '440 Hz', '113 Hz'], 'The fundamental counts as the first harmonic.', 'Harmonics are whole-number multiples, and 3 x 110 = 330 Hz.'),
      mc(L03, 3, 2, 'Two identical sine waves are summed with a 180 degree phase offset. What is the result?', ['They cancel to silence', 'The level doubles', 'The pitch rises an octave', 'A square wave'], 'Peaks meet troughs.', 'Opposite peaks and troughs cancel completely for identical waves.'),
      mc(L03, 4, 2, 'A violin and a flute play the same note at the same loudness yet sound different. What mainly explains this?', ['Their harmonic content and envelopes differ', 'They have different fundamental frequencies', 'One must be louder in dB SPL', 'The sample rate differs'], 'The note and loudness are the same.', 'Timbre comes from the balance of harmonics and how the sound starts and decays.'),
      mc(L03, 5, 3, 'Which description fits a square wave?', ['The fundamental plus only odd harmonics', 'The fundamental plus all harmonics', 'A single frequency with no harmonics', 'Only even harmonics'], 'Compare it with the sawtooth described in the lesson.', 'A square wave consists of the fundamental and odd harmonics only.'),
      // L04
      mc(L04, 1, 1, 'What is the highest frequency that can be captured at a 48 kHz sample rate?', ['24 kHz', '48 kHz', '96 kHz', '12 kHz'], 'It is half the sample rate.', 'The Nyquist frequency is half the sample rate, so 24 kHz.'),
      tf(L04, 2, 1, 'A 30 kHz tone can be captured accurately at a 44.1 kHz sample rate.', 1, 'Compare 30 kHz with half of 44.1 kHz.', '30 kHz is above the 22.05 kHz Nyquist limit, so it would alias.'),
      mc(L04, 3, 2, 'A 30 kHz tone is sampled at 44.1 kHz with no anti-aliasing filter. At what frequency does the alias appear?', ['14.1 kHz', '30 kHz', '22.05 kHz', '74.1 kHz'], 'Subtract the tone frequency from the sample rate.', '44.1 - 30 = 14.1 kHz.'),
      mc(L04, 4, 2, 'What does an anti-aliasing filter do?', ['Removes content above the Nyquist frequency before sampling', 'Adds noise to hide distortion', 'Raises the bit depth', 'Compresses the finished recording into a smaller file once sampling has completed'], 'It acts before the converter measures the signal.', 'It prevents frequencies above the limit from being misread as lower ones.'),
      tf(L04, 5, 3, 'When digital audio is properly converted back to analog, the output is a smooth wave rather than visible stair steps.', 0, 'Consider what reconstruction does with band-limited samples.', 'Proper reconstruction yields the smooth band-limited waveform, not a staircase.'),
      // L05
      tf(L05, 1, 1, 'Each additional bit of depth adds roughly 6 dB of theoretical dynamic range.', 0, 'Recall the 6.02 dB per bit figure.', 'Each bit doubles the number of levels, which is about 6.02 dB.'),
      mc(L05, 2, 2, 'What is the bit rate of uncompressed stereo audio at 48 kHz and 24 bits?', ['2,304 kbps', '1,411.2 kbps', '1,152 kbps', '4,608 kbps'], 'Multiply sample rate, bit depth and channels.', '48,000 x 24 x 2 = 2,304,000 bits per second.'),
      mc(L05, 3, 2, 'About how large is one minute of mono 48 kHz, 16-bit audio?', ['About 5.76 MB', 'About 1.44 MB', 'About 11.5 MB', 'About 0.96 MB'], 'Bytes per second equals rate times bits divided by 8.', '48,000 x 16 / 8 = 96,000 bytes per second, which is 5,760,000 bytes in 60 seconds.'),
      tf(L05, 4, 2, 'Dither should be applied at every processing stage in a project.', 1, 'Think about when the bit depth is actually reduced.', 'Dither belongs at the final bit-depth reduction, applied once.'),
      mc(L05, 5, 3, 'What is the main purpose of dither?', ['To turn quantization distortion into steady low-level noise', 'To raise the sample rate', 'To make a file smaller', 'To remove hum'], 'It is added before reducing the bit depth.', 'Dither randomizes rounding errors so they sound like gentle hiss instead of distortion.'),
      // L06
      tf(L06, 1, 1, 'Condenser microphones normally require power for their circuitry.', 0, 'Recall phantom power.', 'Condensers need phantom power or a battery; dynamics do not.'),
      mc(L06, 2, 1, 'What is the nominal voltage of standard phantom power?', ['48 volts', '5 volts', '12 volts', '120 volts'], 'It is sent over the XLR cable.', 'Standard phantom power is 48 V.'),
      mc(L06, 3, 2, 'Which type is the usual first choice for close-miking a loud guitar amplifier?', ['A dynamic microphone', 'A ribbon microphone with phantom power forced on', 'A battery-powered measurement microphone', 'A small piezo transducer only'], 'Think of rugged microphones that tolerate high levels.', 'Dynamic microphones handle very loud sources and need no power.'),
      mc(L06, 4, 2, 'Before connecting an unfamiliar ribbon microphone with phantom power on, what should you do?', ['Check the manufacturer guidance, because phantom power can harm some models', 'Raise the preamp gain to maximum so the quiet ribbon signal is strong enough to record cleanly', 'Switch to an unbalanced cable', 'Nothing, all ribbons are phantom-safe'], 'Ribbons can be delicate.', 'Some ribbon designs can be damaged by phantom power, so follow the manufacturer.'),
      mc(L06, 5, 3, 'Which design converts sound to voltage by moving a coil in a magnetic field?', ['Dynamic', 'Condenser', 'Piezo contact only', 'Optical sensor'], 'Think about electromagnetic induction.', 'A dynamic microphone moves a diaphragm-attached coil in a magnetic field.'),
      // L07
      mc(L07, 1, 1, 'Where is a cardioid microphone least sensitive?', ['Directly behind the capsule', 'Directly in front', 'At 90 degrees on one side only', 'Everywhere equally'], 'Think of the heart shape pointing forward.', 'A cardioid has its null at the rear.'),
      tf(L07, 2, 1, 'An omnidirectional microphone responds equally to sound from all directions.', 0, 'The name gives it away.', 'Omni means equal sensitivity in every direction.'),
      mc(L07, 3, 2, 'At which angle is a figure-8 microphone least sensitive?', ['90 degrees, at the sides', '0 degrees, at the front', '180 degrees, at the back', 'It is equally sensitive at all angles'], 'It picks up front and back equally.', 'A figure-8 has nulls at the sides.'),
      mc(L07, 4, 2, 'A loud hi-hat leaks into a tom microphone. Which approach best reduces this bleed?', ['Choose a tighter pattern and aim its null toward the hi-hat', 'Switch to an omnidirectional microphone', 'Raise the preamp gain on the tom channel so the tom stays louder than the hi-hat', 'Add reverb to the tom'], 'Use the pattern, not processing.', 'Aiming a null at the unwanted source reduces how much of it is picked up.'),
      mc(L07, 5, 3, 'Which kind of pattern does not show the proximity effect?', ['Omnidirectional (pressure type)', 'Cardioid (single-diaphragm type)', 'Figure-8 (bidirectional ribbon type)', 'Hypercardioid (tighter directional type)'], 'The effect belongs to directional designs.', 'Pressure-type omni microphones lack the proximity bass boost.'),
      // L08
      mc(L08, 1, 1, 'In an open space, how does the sound pressure level change when the distance from a point source doubles?', ['It falls by about 6 dB', 'It falls by about 3 dB', 'It falls by about 12 dB', 'It stays the same'], 'The inverse square law applies.', 'Doubling distance gives about 6 dB less sound pressure level in free field.'),
      tf(L08, 2, 1, 'The proximity effect increases low frequencies as a directional microphone moves very close to a source.', 0, 'Think about close-miking a singer.', 'Directional microphones boost bass at close range.'),
      mc(L08, 3, 2, 'Two microphones are each 20 cm from their sources. By the 3:1 rule, how far apart should the microphones be at minimum?', ['60 cm', '20 cm', '40 cm', '10 cm'], 'Multiply the source distance by three.', 'The microphones should be at least 3 x 20 cm = 60 cm apart.'),
      mc(L08, 4, 2, 'Which stereo arrangement uses two capsules at the same point?', ['X/Y coincident pair', 'A/B spaced pair with capsules a metre apart', 'ORTF pair with 17 cm spacing', 'Close-miked pair on separate sources'], 'The name means occupying one point.', 'X/Y puts the capsules together so there is no time-of-arrival difference between them.'),
      mc(L08, 5, 3, 'Two microphones are on one source and the summed sound is thin and hollow. What is the most likely cause?', ['Comb filtering from time-of-arrival differences', 'Too much phantom power', 'The sample rate is set too high for the converters to keep up with both signals', 'Dither was applied'], 'Think about delayed copies adding together.', 'Delayed copies of the same sound summing produce comb filtering.'),
      // L09
      mc(L09, 1, 1, 'Which signal is stronger?', ['Line level', 'Microphone level', 'They are the same', 'Neither is a voltage'], 'The preamp raises one to reach the other.', 'A preamp raises tiny microphone-level signals up to line level.'),
      tf(L09, 2, 1, 'Balanced connections reject noise by cancelling interference that appears equally on both conductors.', 0, 'The receiver flips one conductor.', 'Common-mode rejection cancels noise that is identical on both conductors.'),
      mc(L09, 3, 2, 'Professional nominal line level of +4 dBu corresponds to about how many volts RMS?', ['1.228 V', '0.316 V', '4 V', '0.775 V'], 'It is a little over one volt.', '+4 dBu is approximately 1.228 volts RMS.'),
      mc(L09, 4, 2, 'What does a DI box do for an electric bass plugged into it?', ['Converts a high-impedance signal to a low-impedance balanced one', 'Adds phantom power to the pickup', 'Amplifies the signal enough to drive a loudspeaker or headphones directly from the bass', 'Converts audio to digital'], 'It matches instrument signals to microphone inputs.', 'A DI box converts the signal for long balanced cable runs and mic inputs.'),
      mc(L09, 5, 3, 'No sound reaches the speakers. Which is the most sensible approach?', ['Trace the signal stage by stage from the source forward', 'Replace the speakers first', 'Raise the master fader to maximum', 'Change the sample rate'], 'Use the chain order from the lesson.', 'Checking each stage in order isolates the fault efficiently.'),
      // L10
      tf(L10, 1, 1, 'In a fixed-point digital system, signal above 0 dBFS cannot be represented and is clipped.', 0, 'Recall what full scale means.', '0 dBFS is the largest representable value, and anything beyond it clips.'),
      mc(L10, 2, 2, 'A vocal peaks at -18 dBFS and you add 9 dB of gain. Where do the peaks now sit?', ['-9 dBFS', '-27 dBFS', '-18 dBFS', '+9 dBFS'], 'Gain adds in dB.', '-18 + 9 = -9 dBFS.'),
      mc(L10, 3, 2, 'Why is it unnecessary to record 24-bit audio with peaks right at 0 dBFS?', ['The noise floor is already very low, and extra level only risks clipping', 'Because 24-bit audio cannot clip', 'Because peaks do not matter in digital audio as long as the master fader stays below zero', 'Because 0 dBFS is quieter than -18 dBFS'], 'Think about the noise floor of 24-bit audio.', '24-bit recording has so much range that high levels add risk with little benefit.'),
      tf(L10, 4, 2, 'Turning down the channel fader after recording removes clipping distortion that is already in the file.', 1, 'Consider what the file already contains.', 'Clipping is baked into the recording; lowering the level does not restore the flattened peaks.'),
      mc(L10, 5, 3, 'Why does the master bus meter rise as more tracks are added?', ['Their signals sum together', 'Digital audio gets louder over time', 'The sample rate changes', 'Phantom power adds gain'], 'Think about combining signals.', 'Levels add when signals are summed, so leave headroom on the master.'),
      // L11
      tf(L11, 1, 1, 'Soundproofing and acoustic treatment are two names for the same thing.', 1, 'One stops sound crossing walls; the other shapes sound inside a room.', 'Treatment shapes reflections inside the room, while soundproofing blocks transmission through the structure.'),
      mc(L11, 2, 2, 'Using the speed of sound as 343 m/s, what is the lowest axial mode frequency between walls 5 m apart?', ['34.3 Hz', '68.6 Hz', '17.15 Hz', '171.5 Hz'], 'Divide the speed of sound by twice the distance.', '343 / (2 x 5) = 34.3 Hz.'),
      mc(L11, 3, 1, 'Where are bass traps most commonly placed?', ['In room corners', 'In the exact centre of the ceiling only', 'Directly on the speaker cones', 'Outside the building'], 'Low-frequency pressure builds up where surfaces meet.', 'Corners collect low-frequency energy, so thick absorbers there are most effective.'),
      mc(L11, 4, 2, 'Why do engineers check a mix on several playback systems?', ['No single system or room is perfectly neutral, so checking shows how the mix translates', 'Every speaker sounds identical', 'To make the mix quieter', 'Because monitors cannot play bass'], 'Think about what translation means.', 'Comparing systems reveals problems that one room can hide.'),
      mc(L11, 5, 3, 'Thin acoustic foam on a wall mainly does what?', ['Absorbs high frequencies but does little for bass', 'Stops all sound from leaving the room through the walls', 'Removes room modes completely, including those at low frequencies', 'Boosts bass energy by reflecting it back into the room'], 'Consider how thick low-frequency absorbers need to be.', 'Thin foam is effective on highs only; bass needs thick absorbers.'),
      // L12
      mc(L12, 1, 2, 'What is the delay from a 128-sample buffer at 48,000 Hz?', ['About 2.67 ms', 'About 0.37 ms', 'About 128 ms', 'About 26.7 ms'], 'Divide samples by the sample rate.', '128 / 48,000 = 0.00267 s, or 2.67 ms.'),
      tf(L12, 2, 1, 'Increasing the buffer size lowers latency.', 1, 'More samples per block means a longer wait.', 'A larger buffer increases latency while reducing processor load.'),
      mc(L12, 3, 1, 'What is a cue mix for?', ['Giving performers a custom headphone balance', 'Mastering the final song for streaming release', 'Converting audio files between different formats', 'Measuring the loudness of the finished control-room mix'], 'It is separate from the control-room mix.', 'A cue mix lets players hear what they need in their headphones.'),
      mc(L12, 4, 2, 'The 3-2-1 backup guideline calls for what?', ['Three copies, on two kinds of storage, with one off-site', 'Three drives, two cables and one computer connected together in a single studio rack', 'One copy on three drives', 'Three backups per year'], 'The numbers are copies, media and location.', 'It is three copies, two media types and one off-site copy.'),
      mc(L12, 5, 3, 'Why decide the sample rate before starting to record?', ['Changing it later needs conversion and can complicate mixed-rate material', 'Software cannot play different rates', 'Sample rate controls the volume', 'Phantom power depends on it'], 'Think about what happens when files are converted.', 'Settling on a rate early avoids later conversion and mismatched files.'),
      // L13
      tf(L13, 1, 1, 'Non-destructive editing rewrites the original audio file each time you make a cut.', 1, 'The software stores references.', 'Non-destructive editing leaves the original file untouched.'),
      mc(L13, 2, 1, 'What is the purpose of a crossfade?', ['To smooth the join between two clips and avoid clicks', 'To raise the pitch', 'To compress the dynamics', 'To add reverb'], 'It overlaps two clips.', 'A crossfade fades one clip out as another fades in.'),
      mc(L13, 3, 1, 'What is comping?', ['Assembling the best sections of several takes into one performance', 'Compressing audio files', 'Converting stereo to mono', 'Cleaning microphone capsules'], 'The word is short for compiling.', 'Comping builds a composite from the best parts of takes.'),
      mc(L13, 4, 2, 'Why use clip gain before a compressor?', ['It evens out levels so the compressor reacts more consistently', 'It makes the compressor unnecessary, since clip gain controls dynamics in the same way', 'It raises the sample rate', 'It adds phantom power'], 'Think about a single very loud word.', 'Leveling clips beforehand gives the compressor a steadier input.'),
      mc(L13, 5, 3, 'An audible click appears at an edit point. What is the most likely cause?', ['A sudden discontinuity in the waveform at the cut', 'Too much headroom left in the session before the edit', 'A sample rate that is too low for the length of the clip', 'Phantom power being left on during the whole editing session'], 'Think about a jump in the signal.', 'A cut that makes the waveform leap instantly produces a click.'),
      // L14
      mc(L14, 1, 1, 'In the United States, what is the frequency of mains power?', ['60 Hz', '50 Hz', '44.1 Hz', '120 kHz'], 'It matches the mains power frequency.', 'U.S. mains power is 60 Hz; audible hum appears at 60 Hz and its harmonics, often strongest at 120 Hz.'),
      tf(L14, 2, 1, 'Removing the grounding pin from a power cord is a safe way to cure hum.', 1, 'Consider what that pin protects against.', 'The ground pin protects against electric shock and must never be defeated.'),
      mc(L14, 3, 2, 'A signal at -10 dBFS has noise at -70 dBFS. What is the signal-to-noise ratio?', ['60 dB', '80 dB', '7 dB', '-60 dB'], 'Find the difference between the two levels.', '-10 minus -70 is 60 dB.'),
      mc(L14, 4, 2, 'What produces a ground loop?', ['More than one path to ground between connected devices', 'Using only balanced cables', 'A sample rate mismatch between two digital devices that share a word clock cable', 'Phantom power'], 'The word loop gives a clue.', 'Multiple ground paths allow current to circulate and create hum.'),
      mc(L14, 5, 3, 'What should you do if audio and power cables must meet?', ['Cross them at right angles', 'Run them in parallel and bundle them', 'Wrap them around each other', 'Tape them together tightly'], 'Think about how much cable runs alongside the other.', 'Crossing at right angles minimizes induced noise.'),
      // L15
      tf(L15, 1, 1, 'Converting an MP3 to FLAC restores the information lost in the MP3 encoding.', 1, 'Can lost data be recovered?', 'Lossless conversion preserves the MP3 as it is; the discarded data stays lost.'),
      mc(L15, 2, 1, 'Which of these is a lossless compressed format?', ['FLAC', 'MP3 (MPEG-1 Layer III)', 'AAC (Advanced Audio Coding)', 'Opus (low-latency codec)'], 'Think of the formats that decode bit for bit.', 'FLAC is lossless; the others are lossy.'),
      mc(L15, 3, 2, 'How many bytes is 60 seconds of audio at 128 kbps?', ['960,000 bytes', '128,000 bytes', '7,680,000 bytes', '480,000 bytes'], 'Bits per second times seconds, divided by 8.', '128,000 x 60 / 8 = 960,000 bytes.'),
      mc(L15, 4, 2, 'Which workflow is best practice?', ['Archive in lossless and make lossy copies only for delivery', 'Edit in MP3 and export WAV at the end', 'Re-encode lossy files repeatedly to save space', 'Keep only the lossy copy and delete the lossless master once the delivery file is approved'], 'Information discarded cannot return.', 'Keeping masters lossless preserves quality; lossy is a final delivery step.'),
      mc(L15, 5, 3, 'Why does repeated lossy re-encoding degrade audio?', ['Each pass discards more information and adds artifacts', 'It lowers the sample rate each time', 'It adds dither automatically', 'It removes the metadata only'], 'Each encode makes decisions about what to remove.', 'Lossy encoders discard data every time they are run.'),
      // L16
      tf(L16, 1, 1, 'A mono track panned hard left plays only from the left speaker.', 0, 'Hard means all the way.', 'Hard panning sends the signal to one side only.'),
      mc(L16, 2, 2, 'Why are kick drum and bass usually kept in the centre?', ['Low frequencies carry much energy, and centring shares it between both speakers', 'Bass cannot be heard on the sides', 'Panning is impossible below 100 Hz', 'It lowers the overall level of the mix, which is the only reason engineers centre them'], 'Think about energy and load.', 'Centring low-frequency parts distributes the energy evenly across both speakers.'),
      mc(L16, 3, 2, 'What is the purpose of a pan law of -3 dB at the centre?', ['Keep perceived loudness steady as a track moves across the field', 'Make every vocal track quieter than the instruments so it sits behind them in the mix', 'Reduce noise', 'Convert to mono'], 'Consider what changes when a track is in both speakers.', 'The centre cut compensates for the extra acoustic power when both speakers play the signal.'),
      mc(L16, 4, 1, 'What is a common first step in building a mix?', ['A rough balance using only faders', 'Adding reverb and delay to every track in turn', 'Mastering each stem before any balancing begins', 'Applying dither to every track before the balance'], 'The simplest tool comes first.', 'A static balance sets the foundation before processing.'),
      mc(L16, 5, 3, 'Why check a mix in mono?', ['It reveals phase cancellation and balance problems', 'It removes noise', 'It raises loudness', 'It changes the sample rate'], 'Summing channels exposes cancellation.', 'Parts that cancel when summed will shrink or vanish in mono.'),
      // L17
      mc(L17, 1, 1, 'What does a high-pass filter do?', ['Removes frequencies below its cutoff', 'Removes frequencies above its cutoff', 'Boosts only the mids', 'Adds harmonics'], 'It lets the highs pass.', 'A high-pass filter attenuates low frequencies below the cutoff.'),
      tf(L17, 2, 1, 'Raising the Q of a bell filter makes its affected band narrower.', 0, 'Higher Q means more focused.', 'Higher Q gives a narrower bandwidth.'),
      mc(L17, 3, 1, 'What is masking?', ['One sound obscuring another that occupies a similar frequency range', 'A way of covering microphones', 'Removing hum', 'A type of reverb'], 'Think about two instruments competing.', 'Masking occurs when a sound hides another in the same range.'),
      mc(L17, 4, 2, 'Why match levels when comparing EQ on and off?', ['A louder version tends to sound better, which can bias judgment', 'EQ always lowers the volume, so the unprocessed version sounds louder in every case', 'The ear ignores level differences', 'Plug-ins cannot be bypassed'], 'Think about perception bias.', 'Louder generally sounds better, so unmatched comparisons mislead.'),
      mc(L17, 5, 3, 'A guitar and a vocal mask each other in the midrange. Which move best helps?', ['Slightly cut the guitar where the vocal lives', 'Boost both by 6 dB in the same range so each stands out', 'Add more reverb to both so they blend into the space', 'Raise the sample rate so the midrange has more detail'], 'Make room rather than add.', 'Carving a small cut from one part leaves room for the other.'),
      // L18
      tf(L18, 1, 1, 'At a 4:1 ratio, an input 4 dB over the threshold comes out 1 dB over the threshold.', 0, 'Divide the overshoot by the ratio.', 'A 4:1 ratio reduces the overshoot to one quarter.'),
      mc(L18, 2, 2, 'With threshold -20 dB, ratio 4:1 and an input peak of -8 dB, what is the output peak?', ['-17 dB', '-14 dB', '-8 dB', '-12 dB'], 'The overshoot is 12 dB; divide it by the ratio.', '12 / 4 = 3 dB over the threshold, which is -17 dB.'),
      mc(L18, 3, 2, 'With threshold -10 dB, ratio 2:1 and an input of -2 dB, how much gain reduction occurs?', ['4 dB', '8 dB', '2 dB', '6 dB'], 'The input is 8 dB over; the output is 4 dB over.', 'The signal drops from 8 dB over to 4 dB over, so the gain reduction is 4 dB.'),
      mc(L18, 4, 2, 'What does a slower attack setting typically do to a drum hit?', ['Lets more of the initial transient through', 'Removes the transient completely from every drum hit', 'Raises the pitch of the drum by a few semitones', 'Reverses the polarity of the drum signal entirely'], 'Think of the compressor reacting late.', 'A slower attack lets the first part of a transient pass before compression engages.'),
      mc(L18, 5, 3, 'What can a very fast release cause on bass-heavy material?', ['Audible pumping or distortion', 'A lower sample rate for the whole session', 'More headroom in the low frequencies', 'Improved stereo width on the bass'], 'The gain recovers too quickly.', 'Very quick recovery makes the level visibly and audibly jump.'),
      // L19
      mc(L19, 1, 1, 'What does RT60 measure?', ['The time for the reverb tail to fall by 60 dB', 'The reverb level measured at exactly 60 Hz in a room', 'The number of early reflections counted in the first 60 ms', 'The delay time that matches a song tempo of 60 BPM'], 'Think of the decay.', 'RT60 is the decay time to a 60 dB reduction.'),
      mc(L19, 2, 2, 'At 100 BPM, how long is a quarter-note delay?', ['600 ms', '500 ms', '750 ms', '400 ms'], 'Divide 60,000 by the tempo.', '60,000 / 100 = 600 ms.'),
      mc(L19, 3, 2, 'At 120 BPM, how long is a dotted-eighth-note delay?', ['375 ms', '250 ms', '500 ms', '750 ms'], 'An eighth is 250 ms; multiply by 1.5.', '250 x 1.5 = 375 ms.'),
      tf(L19, 4, 1, 'Pre-delay lets the dry sound arrive before the reverb begins.', 0, 'It is a gap before the effect.', 'Pre-delay is a short wait before the reverb starts.'),
      mc(L19, 5, 3, 'Why use an auxiliary send for reverb rather than inserting one on every track?', ['It shares one space across tracks and saves processing', 'It makes tracks louder', 'It removes the need for panning', 'It lowers the sample rate'], 'Think about consistency of space.', 'Auxiliary sends give a consistent space and use less CPU.'),
      // L20
      tf(L20, 1, 1, 'Automation records movements of controls over time.', 0, 'Think of fader rides.', 'Automation stores control changes and replays them.'),
      mc(L20, 2, 1, 'What is a stem?', ['A group of related tracks mixed down into one file', 'A single microphone', 'A type of cable', 'A reverb setting'], 'Drums, vocals or music might each have one.', 'Stems are submixes of related tracks.'),
      mc(L20, 3, 2, 'What does a VCA fader do?', ['Controls the levels of assigned channels without summing their audio', 'Adds reverb to channels', 'Converts to digital', 'Applies dither'], 'It is a control, not an audio path.', 'A VCA moves group levels without routing their audio.'),
      mc(L20, 4, 2, 'What is the purpose of gentle compression on a drum bus?', ['To glue the kit together as one sound', 'To add phantom power to the drum microphones', 'To raise the sample rate of the drum tracks', 'To remove all dynamics from every drum hit'], 'It processes the sum of the drums.', 'Bus compression can unify separate drum tracks.'),
      mc(L20, 5, 3, 'In Touch automation mode, what happens when you let go of the control?', ['The control returns to its previous automated value', 'It continues at the last value until playback stops', 'Automation is deleted', 'The track mutes'], 'Compare with Latch mode.', 'Touch writes only while held; Latch continues at the last value.'),
      // L21
      mc(L21, 1, 1, 'One loudness unit (LU) equals how many dB?', ['1 dB', '3 dB', '6 dB', '10 dB'], 'The units are designed to match.', 'A 1 dB change shifts the reading by 1 LU.'),
      tf(L21, 2, 1, 'LUFS simply reports the highest sample peak in a file.', 1, 'LUFS is about perceived loudness over time.', 'LUFS is a weighted, gated average loudness, not a peak value.'),
      mc(L21, 3, 2, 'A master at -8 LUFS plays on a service that normalizes to -14 LUFS. How much is it turned down?', ['6 dB', '8 dB', '14 dB', '22 dB'], 'Subtract the two numbers.', '-14 minus -8 is -6, so playback is lowered by 6 dB.'),
      mc(L21, 4, 2, 'What is true peak measurement meant to catch?', ['Inter-sample peaks that can clip after conversion or encoding', 'Hum at 60 Hz', 'Reverb decay time', 'Phase cancellation'], 'The peaks sit between samples.', 'True peak estimates levels between samples that can overshoot.'),
      mc(L21, 5, 3, 'Why does the loudness war matter less on normalizing platforms?', ['Loud masters are turned down, so only the lost dynamics remain', 'Normalization raises quiet masters to 0 dBFS', 'LUFS rewards limiting', 'Streaming removes dynamics anyway'], 'Think about what normalization does to loud files.', 'Extra loudness is removed by normalization while the dynamics lost in making it stay lost.'),
      // L22
      tf(L22, 1, 1, 'Mastering can fully fix any problem in a mix.', 1, 'Consider a vocal that is buried.', 'Large mix problems are best solved by revising the mix.'),
      mc(L22, 2, 1, 'What is the Red Book audio CD format?', ['44.1 kHz, 16-bit stereo', '48 kHz, 24-bit stereo', '96 kHz, 24-bit surround', '22.05 kHz, 8-bit mono'], 'It is the CD standard.', 'Audio CDs use 44.1 kHz and 16 bits.'),
      mc(L22, 3, 2, 'What does an ISRC identify?', ['An individual sound recording', 'A specific microphone model and its serial number', 'A mastering studio and its equipment list', 'A sample rate and bit depth combination'], 'It is a code for recordings.', 'ISRC stands for International Standard Recording Code.'),
      mc(L22, 4, 2, 'What is common advice for a mix sent to mastering?', ['Leave headroom and avoid heavy master-bus limiting', 'Limit as hard as possible', 'Deliver only MP3 files', 'Remove all dynamics'], 'The mastering engineer needs room to work.', 'Headroom and no heavy limiting give the engineer flexibility.'),
      mc(L22, 5, 3, 'Why does an album master aim for consistency between tracks?', ['So listeners need not keep adjusting the volume or tone between songs', 'So all songs sound identical', 'So files are smaller', 'To avoid using metadata'], 'Think about the listener.', 'Consistent level and tone create a smooth listening experience across the album.'),
      // L23
      mc(L23, 1, 1, 'How many channels does a 5.1 format have?', ['Six', 'Five', 'Seven', 'Eight'], 'Count the .1 channel too.', 'Five full-range channels plus one LFE channel make six.'),
      tf(L23, 2, 1, 'The .1 in 5.1 refers to a low-frequency effects channel.', 0, 'It is not a full-range speaker.', 'The .1 is the LFE channel.'),
      mc(L23, 3, 2, 'In mid-side processing, what does the mid signal contain?', ['Content common to both left and right channels', 'Only the difference between the left and right channels', 'Only the low frequencies of both channels combined', 'The surround channels of a 5.1 multichannel mix'], 'Side is the difference.', 'Mid is the sum (or average) of left and right.'),
      mc(L23, 4, 2, 'What defines object-based audio such as Dolby Atmos?', ['Sounds carry position metadata and are rendered for the playback system', 'Each sound is fixed to one speaker', 'It uses only two channels', 'It cannot be played on headphones'], 'A renderer decides the speaker feeds.', 'Position metadata lets the renderer adapt sounds to the available speakers.'),
      mc(L23, 5, 3, 'Binaural audio for headphones relies on what?', ['Head-related cues such as timing, level and filtering differences between the ears', 'Five loudspeakers', 'Only an LFE channel', 'Raising the sample rate'], 'It imitates how ears locate sound.', 'HRTFs reproduce the directional cues the head and ears create.'),
      // L24
      mc(L24, 1, 2, 'A delay speaker sits 17.15 m from the mains. With sound at 343 m/s, what delay aligns it?', ['50 ms', '100 ms', '5 ms', '500 ms'], 'Divide distance by speed.', '17.15 / 343 = 0.05 s, or 50 ms.'),
      tf(L24, 2, 1, 'Feedback occurs when sound from a loudspeaker re-enters a microphone and is amplified in a loop.', 0, 'The word loop is key.', 'This acoustic loop builds into a ring when its gain reaches one or more.'),
      mc(L24, 3, 2, 'Where should a cardioid microphone aim its null relative to a monitor wedge?', ['At the wedge', 'Away from the wedge', 'At the audience', 'At the ceiling'], 'Use the rear of the pattern.', 'Placing the wedge in the rear null reduces pickup of the wedge.'),
      mc(L24, 4, 1, 'What does FOH stand for?', ['Front of house', 'Feedback on hold', 'Full output headroom', 'Floor of the hall stage'], 'It is where the audience mix is made.', 'FOH is the front-of-house position.'),
      mc(L24, 5, 3, 'A channel begins to ring with feedback. What is a sensible first action?', ['Lower the gain or level of the ringing channel', 'Raise the master fader so the mix overpowers the ring', 'Move the microphone farther from the singer and raise its gain', 'Turn on phantom power for the ringing microphone'], 'Loop gain must drop below one.', 'Reducing gain lowers the loop gain and stops the ring.'),
      // L25
      mc(L25, 1, 1, 'What is room tone used for?', ['Filling gaps with the sound of the location with no one speaking', 'Adding artificial reverb', 'Re-recording dialogue', 'Setting the frame rate'], 'It is a recording of silence in place.', 'Room tone keeps backgrounds consistent between edits.'),
      tf(L25, 2, 1, 'Foley is performed live, in sync with picture, on a specialised stage.', 0, 'Think of footsteps recorded while watching.', 'Foley artists perform sounds while watching the picture.'),
      mc(L25, 3, 2, 'About how long does one frame last at 24 frames per second?', ['About 41.7 ms', 'About 24 ms', 'About 100 ms', 'About 4.2 ms'], 'Divide one second by 24.', '1000 ms / 24 is about 41.7 ms.'),
      mc(L25, 4, 1, 'What is ADR?', ['Re-recording dialogue in a studio while watching the picture', 'A reverb type', 'An audio compression format', 'A microphone pattern'], 'Actors replace unusable lines.', 'ADR replaces production dialogue with studio recordings.'),
      tf(L25, 5, 3, 'Playing a recording at half speed by resampling lowers its pitch by one octave and doubles its duration.', 0, 'Half the frequency is an octave down.', 'Half speed halves the frequency, one octave, and doubles the length.'),
      // L26
      tf(L26, 1, 1, 'Every jurisdiction allows recording any conversation without the consent of the people involved.', 1, 'Laws vary by place.', 'Some places require all parties to consent, so check local rules.'),
      mc(L26, 2, 2, 'A recorded song in the United States typically involves which two copyrights?', ['The sound recording and the underlying musical composition', 'The microphone and the studio', 'The mix and the master only', 'The file format and the cable'], 'One is the performance fixed in sound, the other is the song.', 'The recording and the composition are separate works with separate owners.'),
      mc(L26, 3, 1, 'When is the best time to agree on credits and ownership?', ['In writing, before the work begins', 'Only after the release has made money', 'Never, because ownership is decided automatically', 'Only if a dispute arises later between collaborators'], 'Prevent unclear ownership.', 'Written agreements made up front avoid disputes.'),
      mc(L26, 4, 2, 'Which habit best protects your ability to work for decades?', ['Limiting exposure to loud sound and using hearing protection', 'Always mixing as loudly as possible', 'Skipping listening breaks', 'Avoiding monitors'], 'Hearing damage is permanent.', 'Protecting hearing keeps a career possible.'),
      mc(L26, 5, 3, 'Using a sample of another artist recording in your track generally requires what?', ['Permission from the rights holders unless a legal exception applies', 'Nothing, if it is short', 'Only a credit', 'Only a different file format'], 'Think about who owns the recording.', 'Samples generally need clearance; exceptions are narrow and vary by country.'),
    ],
  },
};
