import struct, sys
d = open(sys.argv[1], 'rb').read()
assert d[:8] == bytes.fromhex('D0CF11E0A1B11AE1')
ssz = 1 << struct.unpack_from('<H', d, 30)[0]; msz = 1 << struct.unpack_from('<H', d, 32)[0]
nfat, dirstart, _, cutoff, minifat_start, nminifat, difat_start, ndifat = struct.unpack_from('<IIIIIIII', d, 44)
sec = lambda i: d[512 + i * ssz: 512 + (i + 1) * ssz]
difat = list(struct.unpack_from('<109I', d, 76))
s = difat_start
while s < 0xFFFFFFFC and ndifat:
    b = sec(s); vals = struct.unpack('<%dI' % (ssz // 4), b); difat += vals[:-1]; s = vals[-1]
fat = []
for i in difat:
    if i < 0xFFFFFFFC: fat += struct.unpack('<%dI' % (ssz // 4), sec(i))
def chain(start):
    out = b''; s = start
    while s < 0xFFFFFFFC: out += sec(s); s = fat[s]
    return out
dirs = chain(dirstart); wb = None
for i in range(0, len(dirs), 128):
    e = dirs[i:i + 128]; n = struct.unpack_from('<H', e, 64)[0]
    name = e[:max(0, n - 2)].decode('utf-16le', 'replace'); start = struct.unpack_from('<I', e, 116)[0]; size = struct.unpack_from('<Q', e, 120)[0] & 0xFFFFFFFF
    if name in ('Workbook', 'Book'): assert size >= cutoff; wb = chain(start)[:size]
p = 0; fonts = []; sheets = []; cur = None; bof = 0
def ustr(b, o, lenbytes):
    n = struct.unpack_from('<H' if lenbytes == 2 else '<B', b, o)[0]; o += lenbytes; fl = b[o]; o += 1
    return (b[o:o + 2 * n].decode('utf-16le') if fl & 1 else b[o:o + n].decode('latin1'))
while p + 4 <= len(wb):
    rt, ln = struct.unpack_from('<HH', wb, p); body = wb[p + 4:p + 4 + ln]; pos = p; p += 4 + ln
    if rt == 0x0809:
        bof += 1; ty = struct.unpack_from('<H', body, 2)[0]
        if ty == 0x10: cur = {'pos': pos, 'cols': {}, 'std': None, 'def': None, 'rows': {}, 'merge': [], 'setup': None, 'margins': {}, 'scl': None}; sheets.append(cur)
        else: cur = None if ty != 0x10 else cur
    elif rt == 0x0031: fonts.append((ustr(body, 14, 1), struct.unpack_from('<H', body, 0)[0] / 20, struct.unpack_from('<H', body, 6)[0]))
    elif rt == 0x0085: pass
    elif cur is not None:
        if rt == 0x007D:
            c0, c1, w, xf, fl = struct.unpack_from('<HHHHH', body, 0)
            for c in range(c0, min(c1, 20) + 1): cur['cols'][c] = (w, fl & 1)
        elif rt == 0x0055: cur['def'] = struct.unpack_from('<H', body, 0)[0]
        elif rt == 0x0099: cur['std'] = struct.unpack_from('<H', body, 0)[0]
        elif rt == 0x0208:
            r, _, _, h = struct.unpack_from('<HHHH', body, 0)
            if r < 60: cur['rows'][r] = (h & 0x7FFF) / 20
        elif rt == 0x00E5:
            n = struct.unpack_from('<H', body, 0)[0]
            for i in range(n): cur['merge'].append(struct.unpack_from('<HHHH', body, 2 + 8 * i))
        elif rt == 0x00A1: cur['setup'] = struct.unpack_from('<HHHHHH', body, 0)
        elif rt in (0x26, 0x27, 0x28, 0x29): cur['margins'][rt] = struct.unpack_from('<d', body, 0)[0]
print('fonts[0:6]', fonts[:6], 'count', len(fonts))
for sh in sheets[:1]:
    print('defcolwidth', sh['def'], 'standardwidth', sh['std'])
    for c in sorted(sh['cols']): print('ABCDEFGHIJKLMNOPQRSTU'[c], sh['cols'][c][0], round(sh['cols'][c][0] / 256, 4), 'hidden' if sh['cols'][c][1] else '')
    print('rows', [sh['rows'].get(r) for r in range(0, 8)], 'setup(paper,scale,start,fitW,fitH,flags)', sh['setup'], 'margins in', {hex(k): round(v, 3) for k, v in sh['margins'].items()})
    print('merges rows>=30', sorted([m for m in sh['merge'] if m[0] >= 30])[:14], 'n', len(sh['merge']))
