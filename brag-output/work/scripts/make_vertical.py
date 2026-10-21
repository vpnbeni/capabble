"""Build vertical.html (1080x1920, 9:16) from index.html (1920x1080).

The landscape composition stays the source of truth; this script swaps the
canvas size, adds a portrait layout override block and adjusts the few
positions that live in script. Content is kept inside the Stories safe zone
(roughly y 250-1600). Usage: python3 make_vertical.py <work-dir>
"""
import sys, pathlib

work = pathlib.Path(sys.argv[1])
s = (work / 'index.html').read_text()


def R(a, b, count=1):
    global s
    assert a in s, a[:80]
    s = s.replace(a, b, count)


R('html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; }',
  'html, body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; }')
R('#stage { position: relative; width: 1920px; height: 1080px; overflow: hidden; }',
  '#stage { position: relative; width: 1080px; height: 1920px; overflow: hidden; }')

PORTRAIT_CSS = '''
  /* ---- portrait layout ---- */
  .h { font-size: 76px; }
  .top { left: 80px; top: 270px; width: 920px; }
  .area { left: 80px; top: 590px; }
  .ui { zoom: 1.24; }
  .left { left: 80px; top: 270px; bottom: auto; width: 920px; justify-content: flex-start; }
  .right { left: 80px; top: 560px; bottom: auto; display: block; }
  .right .ui { zoom: 1.5 !important; }
  .chips { width: 940px; }
  .tiles { left: 80px; top: 540px; width: 920px; grid-template-columns: repeat(2, 1fr); gap: 14px; }
  .tile { height: 110px; padding: 16px 20px; gap: 16px; }
  .tile .tico { width: 58px; height: 58px; }
  .tile b { font-size: 24px; line-height: 30px; }
  .tile span { font-size: 18px; line-height: 24px; }
  #phone { left: 320px; top: 1180px; width: 440px; }
  .bug { left: 80px; bottom: 330px; }
  #link { width: 1080px; height: 1920px; }
  #outwrap { width: 920px !important; height: 200px !important; }
  #outA, #outB { font-size: 84px !important; }
  #biglogo img { width: 120px !important; height: 120px !important; }
  #biglogo > span { font-size: 108px !important; }
  .scene[data-s="0"] .h { font-size: 88px; }
  .chip { height: 68px; padding: 0 26px; font-size: 30px; }
  .scene[data-s="21"] .left { top: 600px; }
  .scene[data-s="21"] .right { top: 800px; }
  .scene[data-s="23.2"] .top { top: 560px; }
  .scene[data-s="23.2"] .area { top: 880px; }
  .scene[data-s="25.5"] .left { top: 400px; }
  .scene[data-s="25.5"] .right { top: 640px; }
'''
R('</style>', PORTRAIT_CSS + '</style>')

# headlines: break before the accent phrase so lines split on meaning
import re
def brk(m):
    h = m.group(0)
    if 'id="outA"' in h or 'id="outB"' in h or 'data-t="0.1"' in h or 'data-t="21.05"' in h:
        return h
    return h.replace(', <span class="a">', ',<br><span class="a">').replace('. <span class="a">', '.<br><span class="a">').replace(' <span class="a">', '<br><span class="a">')
s = re.sub(r'<h2 class="h"[^>]*>.*?</h2>', brk, s)

# payroll card: narrower columns so it fits 920px
s = s.replace('<div class="cb-card" style="width:1170px">', '<div class="cb-card" style="width:740px">')
s = s.replace('1fr 160px 300px 140px', '1fr 84px 210px 84px')

# tagline container gets an id so the override can size it
R('<div style="position:relative; width:1700px; height:110px;">', '<div id="outwrap" style="position:relative; width:1700px; height:110px;">')

# backdrop crops for a portrait frame: keep each photo's subject in view
s = s.replace('data-pos="center 30%"><img src="../../brand-assets/photos/school-assembly.webp"', 'data-pos="50% center"><img src="../../brand-assets/photos/school-assembly.webp"')
s = s.replace('data-pos="center 40%"><img src="../../brand-assets/photos/school-bus-stop.webp"', 'data-pos="70% center"><img src="../../brand-assets/photos/school-bus-stop.webp"')
s = s.replace('data-pos="center 35%"><img src="../../brand-assets/photos/teacher-attendance.webp"', 'data-pos="58% center"><img src="../../brand-assets/photos/teacher-attendance.webp"')
s = s.replace('data-pos="center 40%"><img src="../../brand-assets/photos/parent-child-phone.webp"', 'data-pos="24% center"><img src="../../brand-assets/photos/parent-child-phone.webp"')

# phone rises from below instead of sliding in from the right
R("ph.style.transform = `translateX(${(1 - pin) * 120 + pout * 60}px)`;",
  "ph.style.transform = `translateY(${(1 - pin) * 180 + pout * 90}px)`;")

# link runs down from the card to the phone
R("""      const x1 = 1196, x2 = 1404;
      const line = $('linkline'); line.setAttribute('x1', x1); line.setAttribute('y1', y); line.setAttribute('x2', x2); line.setAttribute('y2', y);
      line.style.opacity = 0.6 * k;
      const m = eio(p(t, a, b - a));
      const dot = $('linkdot'); dot.setAttribute('cx', x1 + (x2 - x1) * m); dot.setAttribute('cy', y);""",
  """      const sc = scenes.find(el => el.style.display === 'block' && el.dataset.link);
      const cards = sc ? [...sc.querySelectorAll('.area .cb-card')] : [];
      const y1 = Math.max(...cards.map(c => c.getBoundingClientRect().bottom)) + 14;
      const y2 = $('phone').getBoundingClientRect().top - 14, x = 540;
      const line = $('linkline'); line.setAttribute('x1', x); line.setAttribute('y1', y1); line.setAttribute('x2', x); line.setAttribute('y2', y2);
      line.style.opacity = 0.6 * k;
      const m = eio(p(t, a, b - a));
      const dot = $('linkdot'); dot.setAttribute('cx', x); dot.setAttribute('cy', y1 + (y2 - y1) * m);""")

# cursor enters from lower right
R("cursorAt(t, [[13.25, 1300, 1040], [13.8, bx, by]])", "cursorAt(t, [[13.25, 980, 1150], [13.8, bx, by]])")

(work / 'vertical.html').write_text(s)
print('wrote', work / 'vertical.html')
