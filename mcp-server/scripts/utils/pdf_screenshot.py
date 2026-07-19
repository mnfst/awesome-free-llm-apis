import sys
import json
import os
import fitz  # PyMuPDF

# ── Tuning parameters ─────────────────────────────────────────────────────────
# Maximum gap (in PDF points, ~1/72 inch) between two figure bounding boxes
# below which they are considered "close enough to merge into one crop".
PROXIMITY_GAP_PT = 40.0

# If the merged bounding box of two close figures occupies less than this
# fraction of the page area, send them as a single crop; otherwise keep separate.
MERGE_RATIO_THRESHOLD = 0.40

# Minimum figure area in page-fraction to bother with
MIN_FIGURE_AREA_RATIO = 0.005   # 0.5% of page

# Maximum number of image blocks returned to the caller
MAX_IMAGE_BLOCKS = 2

# Minimum dimension in PDF points for a drawing cluster to count as a figure
MIN_DRAWING_DIM_PT = 20.0


def _union_rect(r1, r2):
    """Return the bounding rect that encloses both r1 and r2 (lists [x0,y0,x1,y1])."""
    return [min(r1[0], r2[0]), min(r1[1], r2[1]),
            max(r1[2], r2[2]), max(r1[3], r2[3])]


def _gap_between(r1, r2):
    """
    Minimum axis-aligned gap between two bboxes.
    0 means they touch or overlap; negative means overlap.
    """
    gap_x = max(0.0, max(r1[0], r2[0]) - min(r1[2], r2[2]))
    gap_y = max(0.0, max(r1[1], r2[1]) - min(r1[3], r2[3]))
    return max(gap_x, gap_y)


def _area(r):
    return max(0.0, (r[2] - r[0]) * (r[3] - r[1]))


def _collect_figure_rects(page, page_rect, min_area):
    """
    Collect bounding boxes of all visual figure regions on the page:
      1. Embedded raster images (any shape — we use bbox)
      2. Vector drawings / filled paths (charts, diagrams)
    Returns a list of [x0, y0, x1, y1] lists clipped to page_rect.
    """
    rects = []

    # 1. Raster images
    for img_info in page.get_images(full=True):
        xref = img_info[0]
        try:
            for r in page.get_image_rects(xref):
                clipped = r & page_rect
                # Skip tiny logos or header decorations (< 40pt width/height)
                if clipped.width < 40 or clipped.height < 40:
                    continue
                if clipped.width > 0 and clipped.height > 0 and _area([clipped.x0, clipped.y0, clipped.x1, clipped.y1]) >= min_area:
                    rects.append([round(clipped.x0, 2), round(clipped.y0, 2),
                                  round(clipped.x1, 2), round(clipped.y1, 2)])
        except Exception:
            pass

    # 2. Vector drawings / filled path clusters
    # get_drawings() returns path items with a 'rect' key (bounding box of the path)
    try:
        for drawing in page.get_drawings():
            r = drawing.get("rect")
            if r is None:
                continue
            clipped = fitz.Rect(r) & page_rect
            # Skip tiny drawings, header decorations, or bullet shapes (< 40pt)
            if clipped.width < 40 or clipped.height < 40:
                continue
            # Skip thin vector structures (like horizontal divider rules or individual equation blocks)
            if clipped.height < 55:
                continue
            a = _area([clipped.x0, clipped.y0, clipped.x1, clipped.y1])
            if a < min_area:
                continue
            # Skip if it's essentially the whole page (background fill)
            if a / _area([page_rect.x0, page_rect.y0, page_rect.x1, page_rect.y1]) > 0.85:
                continue
            rects.append([round(clipped.x0, 2), round(clipped.y0, 2),
                          round(clipped.x1, 2), round(clipped.y1, 2)])
    except Exception:
        pass

    return rects


def _cluster_rects(rects, gap_threshold):
    """
    Greedy single-linkage clustering: merge any two bboxes whose gap is
    <= gap_threshold into the same cluster, expanding the cluster bbox each time.
    Returns a list of merged [x0, y0, x1, y1] bboxes (one per cluster).
    """
    if not rects:
        return []

    # Work with a mutable list of cluster bboxes
    clusters = [list(r) for r in rects]
    changed = True
    while changed:
        changed = False
        merged = []
        used = [False] * len(clusters)
        for i in range(len(clusters)):
            if used[i]:
                continue
            current = clusters[i]
            for j in range(i + 1, len(clusters)):
                if used[j]:
                    continue
                if _gap_between(current, clusters[j]) <= gap_threshold:
                    current = _union_rect(current, clusters[j])
                    used[j] = True
                    changed = True
            merged.append(current)
            used[i] = True
        clusters = merged

    return clusters


def _maybe_merge_pair(c1, c2, page_area):
    """
    Given two cluster bboxes, decide whether to merge them into one crop.
    Rule: merge if their combined bounding box covers ≤ MERGE_RATIO_THRESHOLD of
    the page area. Otherwise keep them separate.
    Returns a list of bboxes to use (1 or 2 elements).
    """
    combined = _union_rect(c1, c2)
    if _area(combined) / page_area <= MERGE_RATIO_THRESHOLD:
        return [combined]
    return [c1, c2]


def _crop_and_save(page, r_coords, temp_dir, pdf_name, page_num, block_idx):
    """Crop the page to r_coords and save as PNG. Returns the saved path or None."""
    r_fitz = fitz.Rect(r_coords)
    try:
        # If the block is small (width or height < 180pt), render at 300 DPI (upscaled)
        # for maximum clarity of text, charts, or diagrams.
        dpi = 300 if (r_fitz.width < 180 or r_fitz.height < 180) else 150
        block_pix = page.get_pixmap(clip=r_fitz, dpi=dpi)
        block_name = f"{pdf_name}_page_{page_num}_img_{block_idx}.png"
        block_path = os.path.join(temp_dir, block_name)
        block_pix.save(block_path)
        return block_path.replace("\\", "/")
    except Exception:
        return None


def render_page(pdf_path, physical_page_num):
    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        return {"error": f"Failed to open PDF: {str(e)}"}

    total_pages = len(doc)
    if physical_page_num < 1 or physical_page_num > total_pages:
        return {"error": f"Page number {physical_page_num} out of range (1-{total_pages})"}

    # physical page is 0-indexed
    page = doc[physical_page_num - 1]

    # Render full page to PNG
    pix = page.get_pixmap(dpi=150)

    # Find root directory containing package.json
    curr = os.path.dirname(os.path.abspath(__file__))
    while curr:
        if os.path.exists(os.path.join(curr, "package.json")):
            break
        parent = os.path.dirname(curr)
        if parent == curr:
            break
        curr = parent

    temp_dir = os.path.join(curr, "scratch", "temp_pdf")
    os.makedirs(temp_dir, exist_ok=True)

    pdf_name = os.path.splitext(os.path.basename(pdf_path))[0]
    image_name = f"{pdf_name}_page_{physical_page_num}.png"
    image_path = os.path.join(temp_dir, image_name)
    pix.save(image_path)

    text = page.get_text()

    # ── Figure region detection ───────────────────────────────────────────────
    page_rect = page.rect
    page_area = _area([page_rect.x0, page_rect.y0, page_rect.x1, page_rect.y1])
    min_area = page_area * MIN_FIGURE_AREA_RATIO

    raw_rects = _collect_figure_rects(page, page_rect, min_area)

    # De-duplicate exact duplicates
    seen_set = set()
    deduped = []
    for r in raw_rects:
        key = tuple(r)
        if key not in seen_set:
            seen_set.add(key)
            deduped.append(r)

    # Cluster spatially close regions
    clusters = _cluster_rects(deduped, PROXIMITY_GAP_PT)

    # Sort clusters by area descending (largest first)
    clusters = sorted(clusters, key=_area, reverse=True)

    # Apply merge-or-separate decision for the top-2 clusters
    final_rects = []
    if len(clusters) == 0:
        final_rects = []
    elif len(clusters) == 1:
        final_rects = [clusters[0]]
    else:
        # Try to merge the two largest; keep result if it reduces to 1 crop,
        # otherwise cap at MAX_IMAGE_BLOCKS separate crops
        pair_result = _maybe_merge_pair(clusters[0], clusters[1], page_area)
        if len(pair_result) == 1:
            # Merged — use that single crop
            final_rects = pair_result
        else:
            # Keep them separate (max 2)
            final_rects = [clusters[0], clusters[1]]

    # Crop and save each final rect
    image_blocks = []
    for idx, r_coords in enumerate(final_rects[:MAX_IMAGE_BLOCKS]):
        saved_path = _crop_and_save(page, r_coords, temp_dir, pdf_name, physical_page_num, idx)
        if saved_path:
            image_blocks.append({
                "rect": [round(v, 2) for v in r_coords],
                "image_path": saved_path,
                "width_pt": round(r_coords[2] - r_coords[0], 2),
                "height_pt": round(r_coords[3] - r_coords[1], 2),
            })

    # Overall image coverage: union area of selected blocks / page area
    covered_area = sum(_area(b["rect"]) for b in image_blocks)
    image_coverage_ratio = round(min(1.0, covered_area / page_area), 4) if page_area > 0 else 0.0

    return {
        "image_path": image_path.replace("\\", "/"),
        "text": text,
        "total_pages": total_pages,
        "image_coverage_ratio": image_coverage_ratio,
        "image_blocks": image_blocks,
    }


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python pdf_screenshot.py <pdf_path> <page_num>"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    try:
        page_num = int(sys.argv[2])
    except ValueError:
        print(json.dumps({"error": "Page number must be an integer"}))
        sys.exit(1)

    result = render_page(pdf_path, page_num)
    print(json.dumps(result, indent=2))

