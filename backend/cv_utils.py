import cv2
import numpy as np
import base64
from sklearn.cluster import KMeans


def base64_to_image(base64_string):
    if "data:image" in base64_string:
        base64_string = base64_string.split(",")[1]
    img_data = base64.b64decode(base64_string)
    np_arr = np.frombuffer(img_data, np.uint8)
    image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Failed to decode image from provided base64 string")
    return image


def get_dominant_color(roi):
    pixels = roi.reshape(-1, 3)
    if len(pixels) == 0:
        return np.array([0, 0, 0], dtype=np.uint8)
    if len(pixels) < 10:
        return np.median(pixels, axis=0).astype(np.uint8)

    # Use trimmed median to reject specular glare highlights and dust
    lum = 0.299 * pixels[:, 2] + 0.587 * pixels[:, 1] + 0.114 * pixels[:, 0]
    p10, p90 = np.percentile(lum, [10, 90])
    valid_mask = (lum >= p10) & (lum <= p90)
    valid_pixels = pixels[valid_mask] if np.any(valid_mask) else pixels

    dominant_bgr = np.median(valid_pixels, axis=0).astype(np.uint8)
    return dominant_bgr


def detect_cube_presence(crop_bgr, sampled_labs=None):
    """
    Detects whether an actual Rubik's cube grid is inside the crop,
    rejecting flat surfaces like curtains, blank walls, ceilings, and desks.
    Uses contrast-adaptive Canny edge detection so dark blue faces with black borders are detected.
    """
    h, w, _ = crop_bgr.shape
    gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # 1. Multi-channel color-aware edge detection (preserves blue & red contrast against black borders)
    # Grayscale heavily attenuates blue (0.114*B), destroying blue-to-black seam contrast.
    # Evaluating across B, G, R channels preserves distinct physical seams for all cube faces.
    blurred_b = cv2.GaussianBlur(crop_bgr[:, :, 0], (5, 5), 0)
    blurred_g = cv2.GaussianBlur(crop_bgr[:, :, 1], (5, 5), 0)
    blurred_r = cv2.GaussianBlur(crop_bgr[:, :, 2], (5, 5), 0)

    edges_b = cv2.Canny(blurred_b, 25, 75)
    edges_g = cv2.Canny(blurred_g, 25, 75)
    edges_r = cv2.Canny(blurred_r, 25, 75)
    edges = cv2.bitwise_or(edges_b, cv2.bitwise_or(edges_g, edges_r))
    total_edge_density = float(np.count_nonzero(edges)) / float(edges.size)

    # 2. Grid seam edge verification
    # Rubik's cube has horizontal and vertical seams at approx 1/3 and 2/3
    step_y, step_x = h // 3, w // 3
    half_band = max(10, int(min(w, h) * 0.045))
    seam_bands = []
    # Vertical seams
    for seam_x in [step_x, 2 * step_x]:
        x0 = max(0, seam_x - half_band)
        x1 = min(w, seam_x + half_band)
        seam_bands.append(edges[:, x0:x1])
    # Horizontal seams
    for seam_y in [step_y, 2 * step_y]:
        y0 = max(0, seam_y - half_band)
        y1 = min(h, seam_y + half_band)
        seam_bands.append(edges[y0:y1, :])

    seam_edge_densities = [float(np.count_nonzero(band)) / float(band.size) for band in seam_bands]
    avg_seam_edges = float(np.mean(seam_edge_densities)) if seam_edge_densities else 0.0

    # 3. Flat surface / curtain rejection via cell color variance
    flat_surface = False
    if sampled_labs is not None and len(sampled_labs) == 9:
        labs_arr = np.array(sampled_labs)
        std_L = float(np.std(labs_arr[:, 0]))
        std_a = float(np.std(labs_arr[:, 1]))
        std_b = float(np.std(labs_arr[:, 2]))
        total_std = std_L + std_a + std_b

        # Curtains / walls have nearly zero variance AND almost zero seam edges
        if total_std < 10.0 and avg_seam_edges < 0.007 and total_edge_density < 0.010:
            flat_surface = True

    # Scoring: require distinct seam lines and physical edges
    score_edges = min(1.0, total_edge_density / 0.025)
    score_seams = min(1.0, avg_seam_edges / 0.025)
    presence_score = 0.5 * score_edges + 0.5 * score_seams

    # Strict presence threshold: prevents random room textures (19% presence) from triggering
    is_present = (presence_score >= 0.35 and avg_seam_edges >= 0.006) and not flat_surface

    reason = "Cube detected" if is_present else ("Curtain / Flat surface detected" if flat_surface else "Align cube squarely in grid")
    return is_present, presence_score, reason


def classify_color_lab(target_lab, custom_palette=None, target_rgb=None, target_hsv=None):
    """
    Multi-space color classification with warm-light robustness,
    precise Red vs Orange separation, and calibration profile support.
    """
    L, a, b = [float(v) for v in target_lab]

    # Compute RGB and HSV if not explicitly provided
    if target_rgb is None or target_hsv is None:
        lab_uint8 = np.uint8([[[int(L), int(a), int(b)]]])
        bgr = cv2.cvtColor(lab_uint8, cv2.COLOR_Lab2BGR)[0][0]
        if target_rgb is None:
            target_rgb = [int(bgr[2]), int(bgr[1]), int(bgr[0])]
        if target_hsv is None:
            hsv = cv2.cvtColor(np.uint8([[bgr]]), cv2.COLOR_BGR2HSV)[0][0]
            target_hsv = [int(hsv[0]), int(hsv[1]), int(hsv[2])]

    R, G, B = [float(v) for v in target_rgb]
    H, S, V = [float(v) for v in target_hsv]

    # CIELAB Chroma & Hue Angle
    chroma = float(np.sqrt((a - 128.0) ** 2 + (b - 128.0) ** 2))
    hue_angle = float((np.degrees(np.arctan2(b - 128.0, a - 128.0))) % 360.0)
    gr_ratio = G / max(R, 1.0)

    # =========================================================================
    # 0. Universal Achromatic / Shadow Rejection
    # Genuine shadow, dark plastic core, or neutral gray has low saturation (S < 25),
    # low chroma (< 15), and low lightness (L < 110).
    # =========================================================================
    if chroma < 15.0 and S < 25.0 and L < 110.0:
        return 'unknown'

    # =========================================================================
    # 1. Calibrated Profile Matching (Ground Truth when user calibrated cube)
    # =========================================================================
    if custom_palette:
        min_dist = float('inf')
        best_match = 'unknown'

        for c in custom_palette:
            ref_lab = np.array(c['lab'], dtype=float)
            ref_rgb = c.get('rgb')
            ref_hsv = c.get('hsv')

            if ref_hsv is None and ref_rgb is not None:
                ref_bgr = np.uint8([[[ref_rgb[2], ref_rgb[1], ref_rgb[0]]]])
                ref_hsv = cv2.cvtColor(ref_bgr, cv2.COLOR_BGR2HSV)[0][0].tolist()

            is_white = (c.get('name') == 'white')

            if is_white:
                # White guard: sufficiently bright and not deeply chromatic/saturated
                # Allows for ambient monitor/cool-LED glow (S up to 65, chroma up to 28)
                if L < 95.0 or V < 85.0 or S > 65.0 or chroma > 28.0:
                    continue
                dL = (L - ref_lab[0]) * 1.0  # Full weight on lightness for White
            else:
                # Chromatic colors (Blue, Green, Red, Orange, Yellow):
                # Must have meaningful chroma or saturation
                if S < 25.0 and chroma < 12.0:
                    continue
                # Blue guard: Blue is dark/saturated on Rubik's cubes.
                # A bright sticker (L > 90) cannot match dark calibrated blue (L ~ 30..60)
                if c.get('name') == 'blue' and L > max(90.0, ref_lab[0] + 35.0):
                    continue
                dL = (L - ref_lab[0]) * 0.75

            da = (a - ref_lab[1]) * 1.4
            db = (b - ref_lab[2]) * 1.4

            # Circular Hue difference penalty (for chromatic colors with meaningful hue)
            d_hue = 0.0
            if not is_white and ref_hsv is not None and S > 20.0 and ref_hsv[1] > 20.0:
                h1, h2 = float(H), float(ref_hsv[0])
                h_diff = abs(h1 - h2)
                if h_diff > 90.0:
                    h_diff = 180.0 - h_diff
                d_hue = h_diff * 1.8

            # G/R ratio penalty: separates Red and Orange
            d_gr = 0.0
            if ref_rgb is not None and c.get('name') in ('red', 'orange'):
                ref_gr = float(ref_rgb[1]) / max(float(ref_rgb[0]), 1.0)
                d_gr = abs(gr_ratio - ref_gr) * 40.0

            dist = float(np.sqrt(dL**2 + da**2 + db**2) + d_hue + d_gr)

            if dist < min_dist:
                min_dist = dist
                best_match = c.get('name', 'unknown')

        # Allow reasonable headroom while rejecting off-palette colors
        if min_dist > 62.0:
            return 'unknown'
        return best_match

    # =========================================================================
    # 2. General Preset Classifier (Strict color boundaries & bounded fallback)
    # =========================================================================

    # 1. True White detection:
    # Requires genuine high lightness, low chroma, moderate saturation (tolerant to monitor glow)
    if L >= 105.0 and V >= 100.0 and chroma <= 28.0 and S <= 55.0:
        return 'white'

    # 2. Pure Shadow / Black plastic border rejection (dark AND desaturated)
    if L < 20.0 and V < 22.0 and S < 30.0:
        return 'unknown'

    # 3. Yellow detection:
    # Evaluated BEFORE green so green's negative 'a' does not steal yellow!
    if (18.0 <= H <= 38.0 or (b >= 138.0 and 60.0 <= hue_angle <= 108.0)) and gr_ratio >= 0.58 and R >= 105.0 and S >= 45.0:
        return 'yellow'

    # 4. Green detection:
    # Supports vibrant modern green and darker vintage classic vinyl green (chroma >= 12.0, S >= 28.0)
    if (S >= 28.0 or chroma >= 12.0) and (38.0 <= H <= 88.0 or (a <= 122.0 and 115.0 <= hue_angle <= 185.0)) and (gr_ratio >= 1.05 or R < 110.0):
        return 'green'

    # 5. Blue detection:
    # Blue has Hue in [95, 138] or negative 'b' in Lab (b <= 118). Must not be bright cool-white (L < 100.0)
    if (S >= 35.0 or (chroma >= 20.0 and L < 95.0)) and (95.0 <= H <= 138.0 or (b <= 118.0 and 195.0 <= hue_angle <= 295.0)):
        if L < 100.0:
            return 'blue'

    # 6. Red & Orange separation:
    # Supports both modern high-saturation cubes and classic vinyl sticker cubes (S >= 60, V >= 48)
    if S >= 60.0 and V >= 48.0:
        # Red: low green reflectance (G/R < 0.40) and red hue
        if gr_ratio < 0.40 and (H <= 9.0 or H >= 170.0 or hue_angle < 32.0):
            return 'red'
        # Orange: distinct green reflectance (0.26 <= G/R <= 0.68) and orange hue
        elif (0.26 <= gr_ratio <= 0.68) and (8.0 <= H <= 25.0 or (32.0 <= hue_angle <= 65.0)):
            return 'orange'

    # Bounded fallback to nearest standard color in LAB (only if close enough and chromatic)
    standard_colors = {
        'yellow': np.array([205, 120, 195]),
        'green': np.array([130, 60, 140]),
        'blue': np.array([30, 130, 60]),
        'red': np.array([110, 190, 140]),
        'orange': np.array([155, 170, 185])
    }
    min_dist = float('inf')
    best_match = 'unknown'
    for name, ref_lab in standard_colors.items():
        dL = (L - ref_lab[0]) * 0.7
        da = (a - ref_lab[1]) * 1.4
        db = (b - ref_lab[2]) * 1.4
        dist = np.sqrt(dL**2 + da**2 + db**2)
        if dist < min_dist:
            min_dist = dist
            best_match = name

    # Reject ambiguous / off-palette colors (brown, beige, gray, room clutter)
    if min_dist <= 50.0 and (S >= 32.0 or chroma >= 20.0):
        return best_match

    return 'unknown'


def extract_face_features(image_base64, custom_palette=None):
    """
    Extracts features for all 9 stickers:
    - 4-corner sampling for the center sticker to 100% bypass logos.
    - Trimmed median sampling for outer stickers to eliminate glare.
    - Full cube presence & edge analysis.
    """
    image = base64_to_image(image_base64)
    h, w, _ = image.shape
    min_dim = min(h, w)

    # 80% to match frontend overlay precisely
    crop_size = int(min_dim * 0.80)
    start_x = (w - crop_size) // 2
    start_y = (h - crop_size) // 2
    crop = image[start_y:start_y + crop_size, start_x:start_x + crop_size]

    step = crop_size // 3
    features = []
    temp_labs = []

    for row in range(3):
        for col in range(3):
            cell = crop[row * step:(row + 1) * step, col * step:(col + 1) * step]
            ch, cw, _ = cell.shape

            # --- CENTER STICKER: 4-CORNER LOGO DODGE ---
            if row == 1 and col == 1:
                # Sample 4 quadrants inset by 16%-32% from cell boundary
                # Avoids outer seam reflections, dark border bevels, and central logo
                corners = [
                    cell[int(ch * 0.16):int(ch * 0.32), int(cw * 0.16):int(cw * 0.32)],  # Top-Left
                    cell[int(ch * 0.16):int(ch * 0.32), int(cw * 0.68):int(cw * 0.84)],  # Top-Right
                    cell[int(ch * 0.68):int(ch * 0.84), int(cw * 0.16):int(cw * 0.32)],  # Bottom-Left
                    cell[int(ch * 0.68):int(ch * 0.84), int(cw * 0.68):int(cw * 0.84)]   # Bottom-Right
                ]
                corner_bgrs = [get_dominant_color(c) for c in corners if c.size > 0]
                if corner_bgrs:
                    # Median across corner samples eliminates edge glares and dark shadows
                    avg_bgr = np.median(corner_bgrs, axis=0).astype(np.uint8)
                else:
                    avg_bgr = get_dominant_color(cell[int(ch * 0.20):int(ch * 0.35), int(cw * 0.20):int(cw * 0.35)])
            else:
                # Outer stickers: 24% central region with trimmed median
                sample = cell[int(ch * 0.38):int(ch * 0.62), int(cw * 0.38):int(cw * 0.62)]
                avg_bgr = get_dominant_color(sample)

            avg_lab = cv2.cvtColor(np.uint8([[avg_bgr]]), cv2.COLOR_BGR2Lab)[0][0]
            avg_hsv = cv2.cvtColor(np.uint8([[avg_bgr]]), cv2.COLOR_BGR2HSV)[0][0]
            rgb = [int(avg_bgr[2]), int(avg_bgr[1]), int(avg_bgr[0])]
            lab = avg_lab.tolist()
            hsv = [int(avg_hsv[0]), int(avg_hsv[1]), int(avg_hsv[2])]

            temp_labs.append(lab)

            # Classify sticker color using multi-space model
            detected_color = classify_color_lab(lab, custom_palette, rgb, hsv)
            hue_angle = float((np.degrees(np.arctan2(lab[2] - 128.0, lab[1] - 128.0))) % 360.0)

            features.append({
                "lab": lab,
                "rgb": rgb,
                "hsv": hsv,
                "color": detected_color,
                "hue_angle": round(hue_angle, 1)
            })

    # Detect cube presence across the full crop
    is_present, presence_score, presence_reason = detect_cube_presence(crop, temp_labs)

    return {
        "features": features,
        "is_cube_present": is_present,
        "presence_score": round(presence_score, 2),
        "presence_reason": presence_reason
    }


def classify_entire_cube(ordered_features, custom_palette=None):
    """
    Classifies all 54 stickers into 6 cube faces:
    - If user calibrated their cube (custom_palette), directly matches against calibrated prototypes.
    - Otherwise, falls back to K-Means clustering in Lab space.
    """
    if custom_palette:
        color_to_face = {str(c.get('name', '')).lower(): c.get('face') for c in custom_palette if 'face' in c}
        results = []
        for s in ordered_features:
            color = classify_color_lab(s['lab'], custom_palette, s.get('rgb'), s.get('hsv'))
            face = color_to_face.get(color, 'unknown')
            results.append(face)
        return results

    lab_data = np.array([s['lab'] for s in ordered_features])
    kmeans = KMeans(n_clusters=6, n_init=20, random_state=42)
    labels = kmeans.fit_predict(lab_data)

    center_indices = {'up': 4, 'right': 13, 'front': 22, 'down': 31, 'left': 40, 'back': 49}

    cluster_map = {}
    for face, index in center_indices.items():
        cluster_map[labels[index]] = face

    results = []
    for i in range(len(ordered_features)):
        results.append(cluster_map.get(labels[i], 'unknown'))
    return results