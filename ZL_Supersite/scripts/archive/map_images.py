import re
import os
import glob
import random

# Get all images from tp and tp/志林家居图
base_dir = '/Users/mac/Desktop/志林/tp'
images = []
for ext in ('*.jpg', '*.jpeg', '*.png', '*.webp'):
    images.extend(glob.glob(os.path.join(base_dir, ext)))
    for root, dirs, files in os.walk(os.path.join(base_dir, '志林家居图')):
        images.extend(glob.glob(os.path.join(root, ext)))

# Sort to have deterministic ordering, but we will shuffle later or assign based on some logic
images = sorted(list(set(images)))
print(f"Found {len(images)} images")

# Copy them to assets folder
os.makedirs('/Users/mac/Desktop/志林/assets/tp_images', exist_ok=True)
mapped_images = []
for i, img_path in enumerate(images):
    ext = os.path.splitext(img_path)[1]
    new_path = f"assets/tp_images/img_{i}{ext}"
    os.system(f'cp "{img_path}" "/Users/mac/Desktop/志林/{new_path}"')
    mapped_images.append(new_path)

with open('建材.html', 'r', encoding='utf-8') as f:
    content = f.read()

count = 0
def repl(m):
    global count
    res = mapped_images[count % len(mapped_images)]
    count += 1
    return res

new_content = re.sub(r'assets/prod\d+\.png', repl, content)

with open('建材.html', 'w', encoding='utf-8') as f:
    f.write(new_content)
