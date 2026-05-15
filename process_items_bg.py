"""
tiles/items/ 内の全PNG画像の白背景を透過化するスクリプト。
BFSで外側の白領域のみを除去し、アイコン内部の白は保持する。
"""

import os
import numpy as np
from PIL import Image
from collections import deque

ITEMS_DIR = os.path.join(os.path.dirname(__file__), "tiles", "items")
BG_THRESH = 235  # これ以上を白と見なす（少し低めにして灰色も拾う）


def remove_bg(img, thresh=BG_THRESH):
    """全辺からのBFSで外側白背景のみを透過化。"""
    arr = np.array(img.convert('RGBA'))
    h, w = arr.shape[:2]
    white = (arr[:,:,0] >= thresh) & (arr[:,:,1] >= thresh) & (arr[:,:,2] >= thresh)

    exterior = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in [0, h-1]:
            if white[y, x] and not exterior[y, x]:
                exterior[y, x] = True; q.append((y, x))
    for y in range(1, h-1):
        for x in [0, w-1]:
            if white[y, x] and not exterior[y, x]:
                exterior[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in [(-1,0),(1,0),(0,-1),(0,1)]:
            ny, nx = y+dy, x+dx
            if 0 <= ny < h and 0 <= nx < w and white[ny, nx] and not exterior[ny, nx]:
                exterior[ny, nx] = True; q.append((ny, nx))

    result = arr.copy()
    result[exterior, 3] = 0
    return Image.fromarray(result)


def main():
    files = sorted(f for f in os.listdir(ITEMS_DIR) if f.lower().endswith('.png'))
    print(f"Processing {len(files)} images in {ITEMS_DIR} ...")
    for fname in files:
        path = os.path.join(ITEMS_DIR, fname)
        img = Image.open(path)
        result = remove_bg(img)
        result.save(path, "PNG")
    print(f"Done. {len(files)} images processed.")


if __name__ == "__main__":
    main()
