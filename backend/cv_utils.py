import cv2
import numpy as np
import base64
from sklearn.cluster import KMeans


def base64_to_image(base64_string):
    if "data:image" in base64_string:
        base64_string = base64_string.split(",")[1]
    img_data = base64.b64decode(base64_string)
    np_arr = np.frombuffer(img_data, np.uint8)
    return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)


def get_dominant_color(roi):
    pixels = roi.reshape(-1, 3)
    if len(pixels) == 0: return np.array([0, 0, 0], dtype=np.uint8)
    if len(pixels) < 10: return np.mean(pixels, axis=0)

    kmeans = KMeans(n_clusters=3, n_init=3, random_state=42)
    kmeans.fit(pixels)
    counts = np.bincount(kmeans.labels_)
    dominant_bgr = kmeans.cluster_centers_[np.argmax(counts)]
    return dominant_bgr


def classify_color_lab(target_lab, custom_palette=None):
    if custom_palette:
        min_dist = float('inf')
        best_match = 'unknown'
        for c in custom_palette:
            ref_lab = np.array(c['lab'])
            dist = np.linalg.norm(target_lab - ref_lab)
            if dist < min_dist:
                min_dist = dist
                best_match = c['name']

        if min_dist > 35:
            return 'unknown'
        return best_match

    L, a, b = target_lab
    saturation = np.sqrt((a - 128) ** 2 + (b - 128) ** 2)

    # --- AGGRESSIVE DARK / SHADOW REJECTION ---
    if L < 35: return 'unknown'
    if saturation < 30 and L < 50: return 'unknown'

    if saturation < 18:
        if L > 75:
            return 'white'
        else:
            return 'unknown'

    standard_colors = {
        'yellow': np.array([200, 120, 190]),
        'green': np.array([130, 60, 140]),
        'blue': np.array([30, 130, 60]),
        'red': np.array([100, 190, 130]),
        'orange': np.array([150, 170, 180])
    }

    min_dist = float('inf')
    best_match = 'unknown'

    for name, ref_lab in standard_colors.items():
        dL = (target_lab[0] - ref_lab[0]) * 0.5
        da = (target_lab[1] - ref_lab[1]) * 1.5
        db = (target_lab[2] - ref_lab[2]) * 1.5
        dist = np.sqrt(dL ** 2 + da ** 2 + db ** 2)
        if dist < min_dist:
            min_dist = dist
            best_match = name

    if best_match in ['red', 'orange']:
        if b > 165:
            return 'orange'
        else:
            return 'red'

    if best_match in ['yellow', 'orange']:
        if a > 145:
            return 'orange'
        else:
            return 'yellow'

    return best_match


def extract_face_features(image_base64):
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

    for row in range(3):
        for col in range(3):
            cell = crop[row * step:(row + 1) * step, col * step:(col + 1) * step]
            ch, cw, _ = cell.shape

            # --- RESTORED: CENTER LOGO DODGE ---
            if row == 1 and col == 1:
                # Center Sticker: Microscopic 6% pinpoint tucked in top-left to dodge the logo
                sample = cell[int(ch * 0.15):int(ch * 0.21), int(cw * 0.15):int(cw * 0.21)]
            else:
                # Outer Stickers: 4% microscopic pinpoint exactly in the dead center
                sample = cell[int(ch * 0.48):int(ch * 0.52), int(cw * 0.48):int(cw * 0.52)]

            avg_bgr = get_dominant_color(sample)
            avg_lab = cv2.cvtColor(np.uint8([[avg_bgr]]), cv2.COLOR_BGR2Lab)[0][0]
            features.append({
                "lab": avg_lab.tolist(),
                "rgb": [int(avg_bgr[2]), int(avg_bgr[1]), int(avg_bgr[0])]
            })

    return features


def classify_entire_cube(ordered_features):
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