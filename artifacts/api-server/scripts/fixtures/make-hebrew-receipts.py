"""
Generate clean Hebrew test receipts, each hiding one known trap.

    python3 artifacts/api-server/scripts/fixtures/make-hebrew-receipts.py [OUT_DIR]

The real Hebrew fixtures are photos of faded, creased thermal paper. When the
scanner fails on them it is impossible to tell whether it misread the LAYOUT or
simply could not see the ink. These are the opposite: crisp text in ordinary
Israeli POS layouts, so a failure here is a reading failure, full stop.

Each receipt is written twice: a flat PNG, and a "phone photo" JPEG — slightly
rotated, unevenly lit, a little soft, on a table — which is what users actually
send and what the eval scores. They carry no personal data; every business,
address and number is made up. Hand-checked truth for each lives in
fixtures/expected/<name>.json.

No bidi library is needed. Pillow here has no right-to-left layout engine, so
every string drawn is either pure Hebrew (reversed into visual order and
right-aligned) or pure left-to-right (digits, %, x), placed in its own column —
which is how a receipt printer lays a line out anyway.

Needs Pillow and the Courier New font that ships with macOS.
"""
import os
import random
import re
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT = "/System/Library/Fonts/Supplemental/Courier New.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Courier New Bold.ttf"
W = 1152            # 80 mm paper at 2x, so small print stays legible
M = 70              # side margin
LH = 50             # line height
f_reg = ImageFont.truetype(FONT, 34)
f_big = ImageFont.truetype(FONT_BOLD, 46)
f_bold = ImageFont.truetype(FONT_BOLD, 36)


# A number, time, date or percentage inside a Hebrew line: kept left-to-right.
LTR_RUN = re.compile(r"[0-9A-Za-z]+(?:[.:/\-][0-9A-Za-z]+)*%?")


def vis(text):
    """A logical Hebrew line in visual order, for drawing left to right.

    Just enough bidi for receipts: runs of Hebrew are reversed, runs of digits
    ("40", "18%", "17:00-19:00", "24/09/2026") keep their own order, and the
    runs themselves are laid out right to left. Without the second rule "18%"
    prints as "%81" and a street number 40 as "04" — not a receipt anyone has seen.
    """
    parts, last = [], 0
    for m in LTR_RUN.finditer(text):
        if m.start() > last:
            parts.append(text[last:m.start()][::-1])
        parts.append(m.group(0))
        last = m.end()
    if last < len(text):
        parts.append(text[last:][::-1])
    return "".join(reversed(parts))


class Receipt:
    def __init__(self):
        self.ops = []   # (kind, args)
        self.y = 60

    def center(self, text, font=f_reg, hebrew=True):
        self.ops.append(("c", self.y, vis(text) if hebrew else text, font)); self.y += LH if font is f_reg else 64

    def rule(self, char="-"):
        self.ops.append(("rule", self.y, char)); self.y += LH

    def gap(self, n=0.5):
        self.y += int(LH * n)

    def line(self, name="", amount="", qty="", font=f_reg, indent=0, mid=""):
        """RTL item line: qty at the far right, name to its left, amount at the far left.
        `mid` is an optional left-to-right column between amount and name (e.g. '2 x 12.00')."""
        self.ops.append(("line", self.y, name, amount, qty, font, indent, mid)); self.y += LH

    def render(self):
        H = self.y + 80
        img = Image.new("RGB", (W, H), (250, 250, 246))
        d = ImageDraw.Draw(img)
        for op in self.ops:
            if op[0] == "c":
                _, y, t, font = op
                w = d.textlength(t, font=font)
                d.text(((W - w) / 2, y), t, font=font, fill=(25, 25, 25))
            elif op[0] == "rule":
                _, y, ch = op
                d.text((M, y), ch * 44, font=f_reg, fill=(60, 60, 60))
            else:
                _, y, name, amount, qty, font, indent, mid = op
                right = W - M
                if qty:
                    w = d.textlength(qty, font=font); d.text((right - w, y), qty, font=font, fill=(25, 25, 25))
                    right -= 60
                right -= indent
                if name:
                    t = vis(name); w = d.textlength(t, font=font)
                    d.text((right - w, y), t, font=font, fill=(25, 25, 25))
                if amount:
                    d.text((M, y), amount, font=font, fill=(25, 25, 25))
                if mid:
                    d.text((M + 230, y), mid, font=font, fill=(25, 25, 25))
        return img


def phone_photo(receipt, seed):
    """The receipt as a phone photographs it: on a table, a little skewed, uneven light."""
    rnd = random.Random(seed)
    bg = Image.new("RGB", (receipt.width + 260, receipt.height + 260), (120, 112, 100))
    bg.paste(receipt, (130, 130))
    photo = bg.rotate(rnd.uniform(-1.6, 1.6), resample=Image.BICUBIC, expand=False, fillcolor=(120, 112, 100))
    # a soft shadow falling across part of the paper, as in the real photos
    shade = Image.new("L", photo.size, 0)
    sd = ImageDraw.Draw(shade)
    x0 = rnd.randint(photo.width // 3, photo.width // 2)
    sd.ellipse((x0, photo.height // 4, x0 + photo.width, photo.height), fill=70)
    shade = shade.filter(ImageFilter.GaussianBlur(120))
    photo = Image.composite(Image.new("RGB", photo.size, (0, 0, 0)), photo, shade)
    photo = photo.filter(ImageFilter.GaussianBlur(0.8))
    return photo


def cafe():
    r = Receipt()
    r.center("קפה הגפן", f_big); r.center("רחוב הגפן 12, תל אביב")
    r.center("ח.פ. 510000001"); r.center("24/09/2026 09:41", hebrew=False)
    r.center("שולחן 7   מלצרית: דנה"); r.rule()
    r.line("קפה הפוך גדול", "34.00", "2")
    r.line("מאפה שקדים", "18.00", "1")
    r.line("שקשוקה", "58.00", "1")
    r.line("סלט ישראלי", "42.00", "1")
    r.line("לימונדה נענע", "16.00", "1")
    r.rule()
    r.line("סה\"כ לתשלום", "168.00", font=f_bold)
    r.line("כולל מע\"מ 18%", "25.63")
    r.gap(); r.center("תודה ולהתראות!")
    return r


def bar():
    r = Receipt()
    r.center("בר השכונה", f_big); r.center("שדרות רוטשילד 40, תל אביב")
    r.center("ח.פ. 510000002"); r.center("24/09/2026 18:22", hebrew=False)
    r.center("שולחן 3   מלצר: עומר"); r.rule()
    r.line("בירה גולדסטאר", "64.00", "2")
    r.line("הנחת הפי האוור 25%", "-16.00", indent=40)
    r.line("המבורגר 200 גרם", "78.00", "1")
    r.line("צ'יפס בטטה", "28.00", "1")
    r.line("כנפיים חריפות", "52.00", "1")
    r.line("קוקטייל הבית", "48.00", "1")
    r.line("הנחה 100%", "-48.00", indent=40)
    r.rule()
    r.line("סה\"כ לתשלום", "206.00", font=f_bold)
    r.line("סה\"כ הנחות", "64.00")
    r.line("כולל מע\"מ 18%", "31.42")
    r.gap(); r.center("הפי האוור 17:00-19:00")
    return r


def restaurant():
    r = Receipt()
    r.center("מסעדת הים הכחול", f_big); r.center("טיילת הרברט סמואל 8, תל אביב")
    r.center("ח.פ. 510000003"); r.center("24/09/2026 21:05", hebrew=False)
    r.center("שולחן 12   סועדים: 3"); r.rule()
    r.line("סלט עגבניות", "38.00", "1")
    r.line("פסטה פומודורו", "116.00", "2")
    r.line("פילה לברק", "124.00", "1")
    r.line("טירמיסו", "42.00", "1")
    r.rule()
    r.line("סה\"כ", "320.00")
    r.line("הנחת מועדון 10%", "-32.00")
    r.line("סה\"כ לתשלום", "288.00", font=f_bold)
    r.line("כולל מע\"מ 18%", "43.93")
    r.gap(); r.center("השירות אינו כלול במחיר")
    return r


def noodles():
    r = Receipt()
    r.center("נודלס בר", f_big); r.center("רחוב דיזנגוף 150, תל אביב")
    r.center("ח.פ. 510000004"); r.center("24/09/2026 13:30", hebrew=False)
    r.center("הזמנה 418"); r.rule()
    r.line("ראמן עוף", "62.00", "1")
    r.line(">> תוספת ביצה", "6.00", indent=40)
    r.line(">> בלי כוסברה", "0.00", indent=40)
    r.line("פאד תאי", "58.00", "1")
    r.line(">> חריף", "0.00", indent=40)
    r.line("באו בקר", "64.00", "2")
    r.line("אדממה", "24.00", "1")
    r.line("תה קר", "14.00", "1")
    r.rule()
    r.line("סה\"כ לתשלום", "228.00", font=f_bold)
    r.line("כולל מע\"מ 18%", "34.78")
    return r


def falafel():
    r = Receipt()
    r.center("פלאפל השוק", f_big); r.center("שוק הכרמל 5, תל אביב")
    r.center("ח.פ. 510000005"); r.center("24/09/2026 12:10", hebrew=False)
    r.rule()
    r.line("קולה", "24.00", mid="2 x 12.00")
    r.line("פיתה חומוס", "84.00", mid="3 x 28.00")
    r.line("מנת פלאפל", "36.00", mid="1 x 36.00")
    r.line("סלט טחינה", "28.00", mid="2 x 14.00")
    r.rule()
    r.line("סה\"כ לתשלום", "172.00", font=f_bold)
    r.line("כולל מע\"מ 18%", "26.24")
    r.gap(); r.rule("=")
    r.center("כרטיס אשראי")
    r.line("שולם באשראי", "86.00")
    r.line("יתרה לתשלום", "86.00")
    r.center("**** **** **** 1234", hebrew=False)
    r.gap(); r.center("טיפ: ________")
    return r


RECEIPTS = {
    "he-gen-cafe": cafe,
    "he-gen-bar-happyhour": bar,
    "he-gen-club-discount": restaurant,
    "he-gen-noodles-modifiers": noodles,
    "he-gen-falafel-split": falafel,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out, exist_ok=True)
    for i, (name, make) in enumerate(RECEIPTS.items()):
        flat = make().render()
        flat.save(os.path.join(out, f"{name}.flat.png"))
        phone_photo(flat, seed=i).save(os.path.join(out, f"{name}.jpg"), quality=85)
        print(f"{name}: {flat.width}x{flat.height}")
