#!/usr/bin/python3
"""Rebuild web-only font derivatives and pixel-identical screen deliveries.
The original desktop font, license and captured PNGs remain unchanged.
"""
from pathlib import Path
import hashlib, json, re
from PIL import Image
from fontTools import subset
from fontTools.ttLib import TTFont
ROOT=Path(__file__).resolve().parent.parent
FONT=ROOT/'assets/fonts/LXGWWenKaiMonoGB-Regular.ttf'
out=ROOT/'assets/fonts/web'; out.mkdir(exist_ok=True)
source=TTFont(FONT); available=set(source.getBestCmap())
# Include text from every page and JS feedback, including dynamically created text.
text=''.join(p.read_text() for p in ROOT.iterdir() if p.suffix in {'.html','.js','.css'})
core=({ord(c) for c in text}|set(range(32,127)))&available
parts=[('core',core)]
remaining=available-core
for block in sorted({cp//1024 for cp in remaining}):
    parts.append((f'u{block*1024:05x}',{cp for cp in remaining if cp//1024==block}))
def ranges(points):
    spans=[]
    for cp in sorted(points):
        if spans and cp==spans[-1][1]+1: spans[-1][1]=cp
        else: spans.append([cp,cp])
    return ','.join(f'U+{a:X}'+(f'-{b:X}' if a!=b else '') for a,b in spans)
css=[]; records=[]
for name,points in parts:
    dest=out/f'{name}.woff2'
    font=TTFont(dest) if dest.exists() else None
    if font is None or set(font.getBestCmap())!=points:
        font=TTFont(FONT); options=subset.Options(); options.flavor='woff2'; options.recalc_timestamp=False; options.name_IDs=['*']; options.name_languages=['*']
        sub=subset.Subsetter(options=options); sub.populate(unicodes=points); sub.subset(font)
        font.flavor='woff2'; font.save(dest)
    assert set(font.getBestCmap())==points
    # Subsetting must retain every requested glyph outline and advance exactly.
    for cp in points:
        old=source.getBestCmap()[cp]; new=font.getBestCmap()[cp]
        assert source['hmtx'][old]==font['hmtx'][new]
        assert source['glyf'][old].getCoordinates(source['glyf'])==font['glyf'][new].getCoordinates(font['glyf'])
        a=getattr(source['glyf'][old],'program',None); b=getattr(font['glyf'][new],'program',None)
        assert (a.getBytecode() if a else None)==(b.getBytecode() if b else None)
    css.append("@font-face{font-family:'Zhijian WenKai';src:url('web/"+name+".woff2') format('woff2');font-weight:400;font-style:normal;font-display:swap;unicode-range:"+ranges(points)+'}')
    records.append({'file':str(dest.relative_to(ROOT)),'bytes':dest.stat().st_size,'codepoints':len(points)})
(ROOT/'assets/fonts/web-fonts.css').write_text('\n'.join(css)+'\n')
images=[]
for path in sorted((ROOT/'assets/screens').glob('*.png')):
    before=Image.open(path).convert('RGBA'); dest=ROOT/'assets/screens-web'/f'{path.stem}.webp'
    before.save(dest,'WEBP',lossless=True,method=6,exact=True)
    after=Image.open(dest).convert('RGBA')
    assert before.size==after.size and before.tobytes()==after.tobytes(), path
    images.append({'source':str(path.relative_to(ROOT)),'file':str(dest.relative_to(ROOT)),'sourceBytes':path.stat().st_size,'bytes':dest.stat().st_size,'size':list(before.size),'rgbaSha256':hashlib.sha256(after.tobytes()).hexdigest()})
manifest={'fontSourceSha256':hashlib.sha256(FONT.read_bytes()).hexdigest(),'fontSourceBytes':FONT.stat().st_size,'fontCodepoints':len(available),'fontParts':records,'screens':images}
(ROOT/'assets/web-assets-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'fontOriginal':manifest['fontSourceBytes'],'fontCore':records[0]['bytes'],'fontAll':sum(x['bytes'] for x in records),'screensOriginal':sum(x['sourceBytes'] for x in images),'screensWeb':sum(x['bytes'] for x in images),'screens':len(images)}))
