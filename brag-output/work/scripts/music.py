import numpy as np, wave, sys
SR = 48000; DUR = 32.0; N = int(SR * DUR)
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
loop = [[53,57,60,64],[55,59,62,64],[57,60,64,67],[55,59,62,67]]  # Fmaj7 G6 Am7 G
chords = (loop*4)[:14]
roots = ([41,43,45,43]*4)[:14]
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
padchord(final + [67, 71], 28.5, 2.6, 0.22)

# --- kick + sidechain
kick = np.zeros(N); side = np.ones(N)
kick_times = [1.5] + [t for t in np.arange(2.0, 28.0, beat)] + [28.5]
for t in kick_times:
    n = int(0.45*SR); tt = np.arange(n)/SR
    f = 48 + 110*np.exp(-tt*28)
    k = np.sin(2*np.pi*np.cumsum(f)/SR) * np.exp(-tt*7.5)
    k += 0.05*lp(rng.standard_normal(n), 2500)*np.exp(-tt*180)
    add(kick, k*(0.9 if t != 28.5 else 1.0), t)
    i = int(t*SR); m = int(0.32*SR)
    duck = 1 - 0.55*np.exp(-np.arange(m)/SR*9)
    side[i:i+m] = np.minimum(side[i:i+m], duck[:len(side[i:i+m])])
pad *= side

# --- hats (offbeats) and soft clap
hats = np.zeros(N)
hn = int(0.06*SR); tt = np.arange(hn)/SR
base = rng.standard_normal(hn); base = base - lp(base, 7000)
for t in np.arange(3.25, 28.0, beat):
    add(hats, base*np.exp(-tt*70)*0.05, t)
for t in np.arange(5.5 + 0.5, 28.0, 1.0):
    n = int(0.25*SR); t2 = np.arange(n)/SR
    nz = rng.standard_normal(n); nz = lp(nz, 3200) - lp(nz, 900)
    cl = nz*(np.exp(-t2*30) + 0.5*np.exp(-np.maximum(t2-0.012, 0)*40)*(t2 > 0.012))
    add(hats, lp(cl, 5000)*0.13, t)

# --- bass (8ths) from 7.0
bass = np.zeros(N)
for bar in range(2, 14):
    r = roots[bar]
    for k in range(8):
        t = bar*2.0 + k*0.25
        if t < 5.5: continue
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
for bar in range(7, 14):
    c = chords[bar]
    for k in range(8):
        t = bar*2.0 + k*0.25
        if t < 15.5: continue
        pluck(c[pattern[k]] + 12, t, 0.07 if k % 2 else 0.09)

# --- riser into outro
rs = np.zeros(N); n = int(1.0*SR); t2 = np.arange(n)/SR
nz = rng.standard_normal(n); nz = lp(nz, 600 + 5000*(t2/1.0)**2)
add(rs, nz*(t2/1.0)**2*np.minimum(1,(1.0-t2)/0.08)*0.08, 27.5)

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
for i in range(15):                                   # hook chips
    blip([72, 74, 76, 79, 81][i % 5] + (12 if i >= 10 else 0), 0.75 + i*0.09, 0.03, dec=40)
for i in range(7):                                    # module tiles
    blip([76, 79, 81, 84, 86, 88, 91][i], 3.35 + i*0.07, 0.035, dec=34)
for ti in [6.9, 9.6, 12.0, 14.5, 19.0]:               # parent app notification motif
    bell(84, ti, 0.06); bell(88, ti + 0.11, 0.055)
for i in range(6):                                    # attendance marks
    blip([79, 81, 84, 81, 86, 88][i], 8.45 + i*0.09, 0.035, dec=45)
blip(91, 13.84, 0.045, dec=60)                        # fee click
for i in range(4):                                    # everything in between
    blip([76, 79, 83, 86][i], 15.7 + i*0.15, 0.04, dec=30)
bell(84, 9.0, 0.04); bell(88, 18.45, 0.045)           # badges
for i in range(0, 32, 4):                             # seats
    blip([72, 76, 79, 84, 88, 91, 93, 96][i//4], 21.2 + i*0.015, 0.025, dec=35)
bell(81, 24.0, 0.045)                                 # loss of pay from attendance
for i, t in enumerate([26.2, 26.45, 26.7, 26.95, 27.2, 27.45]):  # switches
    blip([79, 81, 84, 86, 88, 91][i], t, 0.07)
bell(72, 28.55, 0.06); bell(79, 28.55, 0.05); bell(84, 28.6, 0.05)
bell(88, 30.4, 0.045); bell(91, 30.5, 0.035)          # second tagline

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
