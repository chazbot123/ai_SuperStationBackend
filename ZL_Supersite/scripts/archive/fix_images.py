import re

with open('建材.html', 'r', encoding='utf-8') as f:
    content = f.read()

images = ['assets/prod1.png', 'assets/prod2.png', 'assets/prod3.png', 'assets/prod4.png']
count = 0

def repl(m):
    global count
    res = images[count % len(images)]
    count += 1
    return res

new_content = re.sub(r'assets/prod\d+\.png', repl, content)

with open('建材.html', 'w', encoding='utf-8') as f:
    f.write(new_content)
