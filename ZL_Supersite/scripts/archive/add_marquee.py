import re

with open('建材.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Add marquee CSS
marquee_css = """
    .marquee {
      width: 100%;
      overflow: hidden;
      white-space: nowrap;
      background: #000;
      color: #fff;
      padding: 16px 0;
      border-bottom: 2px solid #000;
      border-top: 2px solid #000;
      display: flex;
      align-items: center;
    }
    .marquee span {
      display: inline-block;
      font-size: 24px;
      font-family: "Inter", sans-serif;
      font-weight: 900;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding-left: 100%;
      animation: marquee 20s linear infinite;
    }
    @keyframes marquee {
      0% { transform: translateX(0); }
      100% { transform: translateX(-100%); }
    }
"""
content = content.replace("</style>", marquee_css + "</style>")

# Add marquee elements between sections
marquee_html = """
    <div class="marquee">
      <span>Graphene Heating Art &bull; Premium Decorative Material &bull; Invisible Comfort &bull; Graphene Heating Art &bull; Premium Decorative Material &bull; Invisible Comfort &bull; Graphene Heating Art &bull; Premium Decorative Material &bull; Invisible Comfort &bull;</span>
    </div>
"""

# Insert marquee after <section class="hero">
content = re.sub(r'(</section>\s*<section class="section" id="story">)', marquee_html + r'\1', content)

# Insert marquee after <section class="section" id="portfolio">
content = re.sub(r'(</section>\s*<section class="section" id="metrics">)', marquee_html + r'\1', content)

with open('建材.html', 'w', encoding='utf-8') as f:
    f.write(content)
