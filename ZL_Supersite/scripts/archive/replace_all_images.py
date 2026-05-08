import re

with open('建材.html', 'r', encoding='utf-8') as f:
    content = f.read()

images = ['assets/prod1.png', 'assets/prod2.png', 'assets/prod3.png']
count = 0

def repl(m):
    global count
    res = images[count % len(images)]
    count += 1
    return res

new_content = re.sub(r'https://images\.unsplash\.com[^"\']*', repl, content)

# Remove the broken script
start_idx = new_content.find('<script>\n      (function() {\n        let userUploadedImages')
if start_idx != -1:
    end_idx = new_content.find('</script>\n  </body>', start_idx)
    if end_idx != -1:
        new_content = new_content[:start_idx] + new_content[end_idx+10:]

with open('建材.html', 'w', encoding='utf-8') as f:
    f.write(new_content)
