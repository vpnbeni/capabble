# /brag plan — Capabble School OS

**What it is:** School OS by Capabble, a modular school ERP: each module (Timetable, Students, Exam centre, Assets, Finance, Appointments…) works on its own, and modules share one school's data when you turn more on.
**Who it's for:** CBSE schools — principals, office staff, teachers.
**What sets it apart:** Start with one module, add the rest with one switch; they integrate automatically (Appointments reads the Timetable, so teaching periods show up as unavailable).
**Most impressive claim:** Turning on a new module and it already knows the school — the appointment picker marks teaching periods from the timetable.
**Visual hook:** A single switch flipping on under the line "Start with one module."
**Real UI shown:** The app's own kit CSS (`client/src/styles/capabble/*.css`, copied verbatim): `cb-switch`, `cb-card`, `cb-tt` timetable grid, `cb-slots` slot picker with teaching-period caution slots, `cb-toast`, `cb-badge`. Logo from `capabble-landing/src/app/icon.svg`. Tagline "Assurance of capability." from the landing hero.
**Tone:** `polished` with `default` pacing — confident, calm, clean. No jokes; the product is serious.
**Share caption:** see share-copy.txt.

**Privacy:** No real people. Teacher names (Ms. Kaur, Mr. Rao…), roll nos and the class are fictional stand-ins. No landing-page testimonials or customer names used.

## Identity
Inter 400–800, page `#F4F5F6`, cards white with `#E3E6E8` hairlines, accent `#2458AA` / `#3A7AE1`, chart colours for timetable subjects. Headlines 76px, 800, −0.04em tracking, accent word in accent-strong — same as the landing hero.

## Storyboard (22.0s, 1920×1080, 30fps, 120 BPM — cuts on bar lines)
| # | Time | Scene | On screen | Sound |
|---|---|---|---|---|
| 1 Hook | 0.0–3.0 | One switch | "Start with **one module.**" rises in; a single Timetable switch card flips on at 1.5s | Soft pad + kick enters; switch click |
| 2 Reveal | 3.0–7.0 | Modules card | "Add the rest with **one click.**" / "They work alone. Better together." Five more switches flip on, one per beat | Hats join; 5 tuned clicks |
| 3 Highlight | 7.0–11.0 | Timetable | "Timetable, **without the clashes.**" Class 7-A week grid fills period by period; "No clashes" success badge | Bass joins; soft ticks under fill |
| 4 Highlight | 11.0–15.5 | Appointments | "Appointments already know **who's teaching.**" Slot picker: teaching periods dashed (from Timetable), cursor picks 11:30 am, toast "Meeting booked" | Pluck melody; chime on toast |
| 5 Highlight | 15.5–18.5 | Exam centre | "Exam centre, **down to the seat.**" Hall 3 seats fill with roll nos; badge "24 of 24 seated" | Rising energy |
| 6 Outro | 18.5–22.0 | Logo | Mark + "Assurance of **capability.**" + "School OS by Capabble · school.capabble.cloud" | Final chord rings out, fade |

Transitions: stagger — old content fades/slides out 0.3s, new content rises in. Never a crossfade of two busy layouts.

## Music cue guidance
Synthesized in-house (no bundled track): 120 BPM, A minor → C major feel (Am–F–C–G), kick on beats, pad sidechained gently, switch clicks tuned to the key, chime on the booking toast at 13.6s, final C chord at 18.5s.
