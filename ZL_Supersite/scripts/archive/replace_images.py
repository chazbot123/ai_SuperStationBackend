import re

with open('建材.html', 'r', encoding='utf-8') as f:
    content = f.read()

count = 0
def repl(m):
    global count
    res = f"<images_data_path>[{count % 4}]"
    count += 1
    return res

new_content = re.sub(r'https://images\.unsplash\.com[^"\']*', repl, content)

with open('建材.html', 'w', encoding='utf-8') as f:
    f.write(new_content)
