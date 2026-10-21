import numpy as np, wave, sys
SR = 48000; DUR = 22.0; N = int(SR * DUR)
rng = np.random.default_rng(7)
out = sys.argv[1]
def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
def env_adsr(n, a, d, s, r, sus_len):
    a, d, r = int(a*SR), int(d*SR), int(r*SR); sl = max(0, int(sus_len*SR))
    e = np.concatenate([np.linspace(0,1,max(a,1)), np.linspace(1,s,max(d,1)), np.full(sl, s), np.linspace(s,0,max(r,1))])
    return e[:n] if len(e) >= n else np.pad(e, (0, n-len(e)))
def lp(x, fc):  # one-pole lowpass, fc may be array
    a = np.exp(-2*np.pi*np.asarray(fc)/SR) * np.ones_like(x)
    y = np.zeros_like(x); z = 0.0
    for i in range(len(x)):
        z = (1-a[i])*x[i] + a[i]*z; y[i] = z
    return y
def add(buf, sig, t):
    i = int(t*SR); j = min(N, i+len(sig))
    if i < N: buf[i:j] += sig[:j-i]
def reverb(x, secs=2.2, mix=0.25):
    n = int(secs*SR); t = np.arange(n)/SR
    ir = rng.standard_normal(n) * np.exp(-t*3.2/secs*2.0)
    ir = np.convolve(ir, np.ones(8)/8, 'same'); ir /= np.sqrt(np.sum(ir**2))
    L = len(x)+n; F = 1 << (L-1).bit_length()
    w = np.fft.irfft(np.fft.rfft(x, F)*np.fft.rfft(ir, F), F)[:len(x)]
    return x*(1-mix) + w*mix*0.6

beat = 0.5
chords = [[53,57,60,64],[55,59,62,64],[57,60,64,67],[55,59,62,67],
          [53,57,60,64],[55,59,62,64],[57,60,64,67],[55,60,62,67],[53,57,60,64]]  # Fmaj7 G6 Am7 G ... Gsus Fmaj7
roots = [41,43,45,43,41,43,45,43,41]
final = [48,55,59,62,64]  # Cmaj9

# --- pad
pad = np.zeros(N)
def padchord(notes, t0, length, gain):
    n = int((length+1.2)*SR); tt = np.arange(n)/SR
    s = np.zeros(n)
    for m in notes:
        for det in (-0.08, 0.0, 0.08):
            f = mtof(m + det)
            ph = rng.uniform(0, 1)
            saw = 2*((tt*f + ph) % 1) - 1
            s += saw * 0.33
    s = lp(s, 1400) * env_adsr(n, 0.35, 0.4, 0.8, 1.2, length-0.75)
    add(pad, s*gain/len(notes), t0)
for i, c in enumerate(chords):
    padchord(c, i*2.0, 2.0, 0.16)
padchord(final + [67, 71], 18.5, 2.6, 0.22)

# --- kick + sidechain
kick = np.zeros(N); side = np.ones(N)
kick_times = [1.5] + [t for t in np.arange(2.0, 18.0, beat)] + [18.5]
for t in kick_times:
    n = int(0.45*SR); tt = np.arange(n)/SR
    f = 48 + 110*np.exp(-tt*28)
    k = np.sin(2*np.pi*np.cumsum(f)/SR) * np.exp(-tt*7.5)
    k += 0.05*lp(rng.standard_normal(n), 2500)*np.exp(-tt*180)
    add(kick, k*(0.9 if t != 18.5 else 1.0), t)
    i = int(t*SR); m = int(0.32*SR)
    duck = 1 - 0.55*np.exp(-np.arange(m)/SR*9)
    side[i:i+m] = np.minimum(side[i:i+m], duck[:len(side[i:i+m])])
pad *= side

# --- hats (offbeats) and soft clap
hats = np.zeros(N)
hn = int(0.06*SR); tt = np.arange(hn)/SR
base = rng.standard_normal(hn); base = base - lp(base, 7000)
for t in np.arange(3.25, 18.0, beat):
    add(hats, base*np.exp(-tt*70)*0.05, t)
for t in np.arange(7.0 + 0.5, 18.0, 1.0):
    n = int(0.25*SR); t2 = np.arange(n)/SR
    nz = rng.standard_normal(n); nz = lp(nz, 3200) - lp(nz, 900)
    cl = nz*(np.exp(-t2*30) + 0.5*np.exp(-np.maximum(t2-0.012, 0)*40)*(t2 > 0.012))
    add(hats, lp(cl, 5000)*0.13, t)

# --- bass (8ths) from 7.0
bass = np.zeros(N)
for bar in range(3, 9):
    r = roots[bar]
    for k in range(8):
        t = bar*2.0 + k*0.25
        if t < 7.0: continue
        n = int(0.22*SR); t2 = np.arange(n)/SR
        f = mtof(r + (12 if k % 4 == 3 else 0))
        s = np.sin(2*np.pi*f*t2) + 0.35*np.sin(4*np.pi*f*t2) + 0.12*np.sin(6*np.pi*f*t2)
        s *= env_adsr(n, 0.005, 0.08, 0.6, 0.06, 0.08)
        add(bass, s*0.22, t)
bass *= side

# --- pluck arp from 11.0
pl = np.zeros(N)
def pluck(m, t, g):
    n = int(0.5*SR); t2 = np.arange(n)/SR; f = mtof(m)
    s = (np.sin(2*np.pi*f*t2) + 0.4*np.sin(4*np.pi*f*t2+0.3) + 0.15*np.sin(6*np.pi*f*t2)) * np.exp(-t2*9)
    add(pl, s*g, t)
pattern = [0, 1, 2, 3, 2, 1, 2, 3]
for bar in range(5, 9):
    c = chords[bar]
    for k in range(8):
        t = bar*2.0 + k*0.25
        if t < 11.0: continue
        pluck(c[pattern[k]] + 12, t, 0.07 if k % 2 else 0.09)

# --- riser into outro
rs = np.zeros(N); n = int(1.0*SR); t2 = np.arange(n)/SR
nz = rng.standard_normal(n); nz = lp(nz, 600 + 5000*(t2/1.0)**2)
add(rs, nz*(t2/1.0)**2*np.minimum(1,(1.0-t2)/0.08)*0.08, 17.5)

# --- SFX (tuned to C major)
sfx = np.zeros(N)
def blip(m, t, g, dec=28):
    n = int(0.35*SR); t2 = np.arange(n)/SR; f = mtof(m)
    s = np.sin(2*np.pi*f*t2)*np.exp(-t2*dec) + 0.3*np.sin(2*np.pi*2*f*t2)*np.exp(-t2*dec*1.6)
    tr = rng.standard_normal(n)*np.exp(-t2*900)*0.25
    add(sfx, (s+tr)*g, t)
def bell(m, t, g):
    n = int(1.6*SR); t2 = np.arange(n)/SR; f = mtof(m)
    s = (np.sin(2*np.pi*f*t2) + 0.5*np.sin(2*np.pi*2.0*f*t2)*np.exp(-t2*3) + 0.25*np.sin(2*np.pi*3.01*f*t2)*np.exp(-t2*5))*np.exp(-t2*3.2)
    s *= np.minimum(1, t2/0.004)
    add(sfx, s*g, t)
blip(76, 1.55, 0.10)                                  # first switch
for t, m in zip([3.6, 4.0, 4.4, 4.8, 5.2], [79, 81, 84, 86, 88]):
    blip(m, t, 0.08)
for pi in range(6):                                   # timetable columns
    blip([72, 74, 76, 79, 81, 84][pi], 7.55 + pi*0.17, 0.05, dec=22)
bell(84, 9.55, 0.07)                                  # no clashes badge
blip(91, 12.52, 0.045, dec=60); blip(91, 13.17, 0.045, dec=60)   # cursor clicks
bell(79, 13.45, 0.08); bell(84, 13.6, 0.08)           # booked chime
for i in range(0, 24, 4):                             # seats shimmer
    blip([72, 76, 79, 84, 88, 91][i//4], 15.95 + i*0.055*1.0, 0.03, dec=30)
bell(88, 17.35, 0.06)                                 # seated badge
bell(72, 18.55, 0.06); bell(79, 18.55, 0.05); bell(84, 18.6, 0.05)

music = pad + kick*0.55 + hats + bass + pl + rs
music = reverb(music, 1.6, 0.18)
sfxw = reverb(sfx, 2.0, 0.35)
mix = music + sfxw
# fade in/out
t = np.arange(N)/SR
mix *= np.minimum(1, t/0.05) * np.clip((DUR - t)/1.4, 0, 1)**1.5
mix = np.tanh(mix*1.6)/1.6
mix /= np.max(np.abs(mix)) / 0.89
st = np.stack([mix, mix], 1)
# small stereo width for pad via delay
d = int(0.011*SR); st[d:, 1] = 0.85*st[d:, 1] + 0.15*mix[:-d]
pcm = (st*32767).astype(np.int16)
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok', out)
