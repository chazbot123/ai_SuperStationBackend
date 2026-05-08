with open('建材.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Make marquee text repeat better
new_marquee_html = """
    <div class="marquee">
      <div class="marquee-content">
        <span>GRAPHENE HEATING ART &bull; PREMIUM DECORATIVE MATERIAL &bull; INVISIBLE COMFORT &bull; GRAPHENE HEATING ART &bull; PREMIUM DECORATIVE MATERIAL &bull; INVISIBLE COMFORT &bull; </span>
        <span>GRAPHENE HEATING ART &bull; PREMIUM DECORATIVE MATERIAL &bull; INVISIBLE COMFORT &bull; GRAPHENE HEATING ART &bull; PREMIUM DECORATIVE MATERIAL &bull; INVISIBLE COMFORT &bull; </span>
      </div>
    </div>
"""

content = content.replace("""
    <div class="marquee">
      <span>Graphene Heating Art &bull; Premium Decorative Material &bull; Invisible Comfort &bull; Graphene Heating Art &bull; Premium Decorative Material &bull; Invisible Comfort &bull; Graphene Heating Art &bull; Premium Decorative Material &bull; Invisible Comfort &bull;</span>
    </div>
""", new_marquee_html)

new_marquee_css = """
    .marquee {
      width: 100%;
      overflow: hidden;
      background: #000;
      color: #fff;
      padding: 24px 0;
      border-bottom: 2px solid #000;
      border-top: 2px solid #000;
      display: flex;
    }
    .marquee-content {
      display: flex;
      width: fit-content;
      animation: marquee 20s linear infinite;
    }
    .marquee span {
      font-size: 32px;
      font-family: "Inter", sans-serif;
      font-weight: 900;
      letter-spacing: 0.1em;
      white-space: nowrap;
      padding-right: 10px;
    }
    @keyframes marquee {
      0% { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
"""

import re
content = re.sub(r'\.marquee \{.*?\@keyframes marquee \{.*?\}', new_marquee_css, content, flags=re.DOTALL)

with open('建材.html', 'w', encoding='utf-8') as f:
    f.write(content)
