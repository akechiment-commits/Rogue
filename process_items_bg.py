"""
tiles/items/ 内の全PNG画像の白背景を透過化し、
孤立した小さなゴミピクセルも除去するスクリプト。
"""

import os
import numpy as np
from PIL import Image
from collections import deque

ITEMS_DIR = os.path.join(os.path.dirname(__file__), "tiles", "items")
BG_THRESH = 235
KEEP_FRAC = 0.3   # 最大成分の30%未満の孤立クラスタは除去


def remove_bg(arr, thresh=BG_THRESH):
    """全辺からのBFSで外側白背景のみを透過化。"""
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
    arr[exterior, 3] = 0


def remove_isolated_clusters(arr, keep_frac=KEEP_FRAC):
    """最大連結成分の keep_frac 未満の孤立クラスタを透過化。"""
    h, w = arr.shape[:2]
    visible = arr[:,:,3] > 10
    visited = np.zeros((h, w), dtype=bool)
    components = []

    for sy in range(h):
        for sx in range(w):
            if visible[sy, sx] and not visited[sy, sx]:
                comp = []
                q = deque([(sy, sx)])
                visited[sy, sx] = True
                while q:
                    y, x = q.popleft()
                    comp.append((y, x))
                    for dy, dx in [(-1,0),(1,0),(0,-1),(0,1)]:
                        ny, nx = y+dy, x+dx
                        if 0 <= ny < h and 0 <= nx < w and visible[ny,nx] and not visited[ny,nx]:
                            visited[ny, nx] = True
                            q.append((ny, nx))
                components.append(comp)

    if not components:
        return 0
    max_size = len(max(components, key=len))
    threshold = max_size * keep_frac
    removed = 0
    for comp in components:
        if len(comp) < threshold:
            for y, x in comp:
                arr[y, x, 3] = 0
            removed += len(comp)
    return removed


def process_image(path):
    img = Image.open(path).convert('RGBA')
    arr = np.array(img, dtype=np.uint8)
    remove_bg(arr)
    removed = remove_isolated_clusters(arr)
    Image.fromarray(arr).save(path, "PNG")
    return removed


def main():
    files = sorted(f for f in os.listdir(ITEMS_DIR) if f.lower().endswith('.png'))
    print(f"Processing {len(files)} images ...")
    total_removed = 0
    for fname in files:
        path = os.path.join(ITEMS_DIR, fname)
        removed = process_image(path)
        if removed > 0:
            print(f"  {fname}: removed {removed} garbage pixels")
        total_removed += removed
    print(f"Done. Total garbage pixels removed: {total_removed}")


if __name__ == "__main__":
    main()
