"""Builds assets/sprites/atlas.png + atlas.json and the nebula from the vendored Kenney art.

Run: python3 tools/art/build-atlas.py  (needs Pillow). Every source is CC0, see
assets/vendor/kenney/LICENSE.txt and THIRD_PARTY_NOTICES.md. Sprites face up (nose to -y).
Amber shots and the neutral beacon are made here from the blue originals (hue shift, desaturate).
"""
import colorsys, json, os, random
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
V = os.path.join(ROOT, 'assets', 'vendor', 'kenney')
OUT = os.path.join(ROOT, 'assets', 'sprites')
R, X, P, E = 'Space Shooter Remastered', 'Space Shooter Extension/Sprites', 'Particle Pack/PNG (Transparent)', 'Explosion Pack/Regular explosion'

def load(p): return Image.open(os.path.join(V, p)).convert('RGBA')

def hue(im, to_h, sat=1.0):
    """Moves every coloured pixel to hue to_h; greys stay grey."""
    px = im.load(); w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0: continue
            hh, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if s > 0.15: hh = to_h; s = min(1, s * sat)
            r2, g2, b2 = colorsys.hls_to_rgb(hh, l, s)
            px[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    return im

def grey(im):
    px = im.load(); w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]; v = round(0.3 * r + 0.59 * g + 0.11 * b)
            px[x, y] = (v, v, round(v * 1.08) if v < 236 else v, a)
    return im

def fit(im, m):
    im = im.copy(); im.thumbnail((m, m), Image.LANCZOS); return im

AMBER = 0.105
sprites = {
    'ship_dart_0': load(f'{R}/playerShip3_blue.png'), 'ship_dart_1': load(f'{R}/playerShip3_orange.png'),
    'ship_lancer_0': load(f'{R}/playerShip1_blue.png'), 'ship_lancer_1': load(f'{R}/playerShip1_orange.png'),
    'ship_bulwark_0': load(f'{R}/Enemies/enemyBlue4.png').rotate(180), 'ship_bulwark_1': load(f'{R}/Enemies/enemyRed4.png').rotate(180),
    'shot_bolt_0': load(f'{R}/Lasers/laserBlue01.png'), 'shot_scatter_0': load(f'{R}/Lasers/laserBlue05.png'),
    'shot_rico_0': load(f'{R}/Lasers/laserBlue08.png'), 'impact_0': load(f'{R}/Lasers/laserBlue09.png'),
    'flame_0': load(f'{R}/Effects/fire01.png'), 'flame_1': load(f'{R}/Effects/fire03.png'), 'flame_burn': load(f'{R}/Effects/fire08.png'),
    'shield': load(f'{R}/Effects/shield1.png'),
    'mine_0': load(f'{R}/ufoBlue.png'), 'mine_1': load(f'{R}/ufoYellow.png'),
    'beacon_0': load(f'{X}/Station/spaceStation_022.png'), 'beacon_1': load(f'{X}/Station/spaceStation_023.png'),
    'beacon_n': grey(load(f'{X}/Station/spaceStation_022.png')),
    'spark': fit(load(f'{P}/spark_01.png'), 64), 'glint': fit(load(f'{P}/star_06.png'), 64),
    'planet_a': fit(load('Planets/Planets/planet04.png'), 256), 'planet_b': fit(load('Planets/Planets/planet09.png'), 256),
}
for i in range(1, 5): sprites[f'rock_big{i}'] = load(f'{R}/Meteors/meteorGrey_big{i}.png')
for i in (1, 2): sprites[f'rock_med{i}'] = load(f'{R}/Meteors/meteorGrey_med{i}.png')
for i in range(9): sprites[f'boom_{i}'] = fit(load(f'{E}/regularExplosion0{i}.png'), 128)
for k in ('shot_bolt', 'shot_scatter', 'shot_rico', 'impact'):
    sprites[f'{k}_1'] = hue(sprites[f'{k}_0'].copy(), AMBER, 1.1)

# shelf packing, tallest first, 2 px padding
order = sorted(sprites, key=lambda k: -sprites[k].height)
W, pad, x, y, row, frames = 1024, 2, 0, 0, 0, {}
for k in order:
    im = sprites[k]
    if x + im.width + pad > W: x, y, row = 0, y + row + pad, 0
    frames[k] = (x, y, im.width, im.height); x += im.width + pad; row = max(row, im.height)
H = 1 << (y + row).bit_length()
atlas = Image.new('RGBA', (W, H))
for k, (fx, fy, fw, fh) in frames.items(): atlas.paste(sprites[k], (fx, fy))
os.makedirs(OUT, exist_ok=True)
atlas.save(os.path.join(OUT, 'atlas.png'), optimize=True)
json.dump({'frames': {k: {'frame': {'x': fx, 'y': fy, 'w': fw, 'h': fh}} for k, (fx, fy, fw, fh) in frames.items()},
           'meta': {'image': 'atlas.png', 'size': {'w': W, 'h': H}, 'scale': 1}}, open(os.path.join(OUT, 'atlas.json'), 'w'), indent=1)

# the nebula: soft smoke puffs in cool blue and violet, seeded so it rebuilds the same
rng = random.Random(7); N = 1024
neb = Image.new('RGBA', (N, N))
puffs = [load(f'{P}/smoke_0{i}.png') for i in (1, 4, 7)]
for _ in range(26):
    p = puffs[rng.randrange(3)].rotate(rng.uniform(0, 360)); s = rng.randint(260, 560); p = p.resize((s, s), Image.LANCZOS)
    col = rng.choice([(60, 80, 220), (110, 60, 210), (30, 110, 200), (140, 50, 180)])
    tint = Image.new('RGBA', p.size, col + (0,)); k = rng.uniform(0.35, 0.6); a = p.getchannel('A').point(lambda v: int(v * k))
    tint.putalpha(a)
    px, py = rng.randrange(N), rng.randrange(N)
    for dx in (-N, 0, N):
        for dy in (-N, 0, N):
            box = (px - s // 2 + dx, py - s // 2 + dy)
            if box[0] < N and box[1] < N and box[0] + s > 0 and box[1] + s > 0:
                layer = Image.new('RGBA', (N, N)); layer.paste(tint, box, tint); neb = Image.alpha_composite(neb, layer)
neb.resize((N // 2, N // 2), Image.LANCZOS).save(os.path.join(OUT, 'nebula.png'), optimize=True)  # soft anyway; drawn at 2x
grey_bg = load(f'{R}/Backgrounds/black.png'); grey_bg.save(os.path.join(OUT, 'space.png'), optimize=True)
print(f'atlas {W}x{H}, {len(frames)} frames')
