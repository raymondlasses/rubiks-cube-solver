import sys
sys.path.append('.')
import cv2
import numpy as np
import base64
from cv_utils import detect_cube_presence, classify_color_lab, classify_entire_cube, extract_face_features
from main import scan_raw, ImageInput, solve_global, SolveInput, reset

def make_cube_image(center_bgr, other_bgr, border_bgr=(15, 15, 15)):
    h, w = 300, 300
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:] = border_bgr
    step = 100
    for r in range(3):
        for c in range(3):
            color = center_bgr if (r == 1 and c == 1) else other_bgr
            img[r*step+8:(r+1)*step-8, c*step+8:(c+1)*step-8] = color
    return img

def to_base64(img):
    _, buffer = cv2.imencode('.jpg', img)
    return 'data:image/jpeg;base64,' + base64.b64encode(buffer).decode()

def run_tests():
    print("=== TEST 1: Flat surface rejection ===")
    blank_wall = np.full((300, 300, 3), [120, 115, 110], dtype=np.uint8)
    is_pres, score, reason = detect_cube_presence(blank_wall)
    print(f"Blank wall -> is_present={is_pres}, score={score}, reason='{reason}'")
    assert not is_pres, "Blank wall should not be detected as a cube!"

    print("\n=== TEST 2: Real cube presence (including dark blue face) ===")
    # Blue BGR: [90, 30, 10]
    blue_face = make_cube_image([90, 30, 10], [90, 30, 10])
    is_pres, score, reason = detect_cube_presence(blue_face)
    print(f"Blue face -> is_present={is_pres}, score={score}, reason='{reason}'")
    assert is_pres, "Dark blue face with black borders must be detected!"

    print("\n=== TEST 3: User uploaded sample color rejection ===")
    # User's muddy brown from screenshot: RGB [122, 85, 73]
    user_brown_rgb = [122, 85, 73]
    bgr = np.uint8([[[user_brown_rgb[2], user_brown_rgb[1], user_brown_rgb[0]]]])
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2Lab)[0][0]
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)[0][0]
    res_brown = classify_color_lab(lab.tolist(), target_rgb=user_brown_rgb, target_hsv=hsv.tolist())
    print(f"User brown {user_brown_rgb} -> '{res_brown}' (MUST BE 'unknown', previously was 'white')")
    assert res_brown == 'unknown', "User brown should NOT be classified as white or red!"

    # User's dark grey from screenshot: RGB [46, 50, 48]
    user_grey_rgb = [46, 50, 48]
    bgr = np.uint8([[[user_grey_rgb[2], user_grey_rgb[1], user_grey_rgb[0]]]])
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2Lab)[0][0]
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)[0][0]
    res_grey = classify_color_lab(lab.tolist(), target_rgb=user_grey_rgb, target_hsv=hsv.tolist())
    print(f"User grey {user_grey_rgb} -> '{res_grey}' (MUST BE 'unknown', previously was 'blue')")
    assert res_grey == 'unknown', "User grey should NOT be classified as blue!"

    print("\n=== TEST 4: Valid standard colors ===")
    colors_to_test = {
        'white': [235, 235, 240],
        'yellow': [255, 220, 0],
        'green': [0, 180, 70],
        'blue': [10, 45, 130],
        'red': [190, 20, 25],
        'orange': [255, 100, 0]
    }
    for expected, rgb in colors_to_test.items():
        bgr = np.uint8([[[rgb[2], rgb[1], rgb[0]]]])
        lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2Lab)[0][0]
        hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)[0][0]
        detected = classify_color_lab(lab.tolist(), target_rgb=rgb, target_hsv=hsv.tolist())
        print(f"Expected '{expected}' -> detected '{detected}'")
        assert detected == expected, f"Expected {expected}, got {detected}"

    print("\n=== TEST 5: Custom Calibration Ground Truth Overwrite ===")
    custom_palette = [
        {"face": "up", "name": "white", "rgb": [220, 220, 225], "lab": [220, 128, 128], "hsv": [0, 5, 220]},
        {"face": "down", "name": "yellow", "rgb": [240, 210, 20], "lab": [210, 120, 190], "hsv": [26, 230, 240]},
        {"face": "front", "name": "green", "rgb": [20, 160, 60], "lab": [130, 70, 145], "hsv": [65, 220, 160]},
        {"face": "back", "name": "blue", "rgb": [8, 25, 75], "lab": [24, 144, 96], "hsv": [113, 230, 75]}, # very dark blue L=24
        {"face": "right", "name": "red", "rgb": [170, 15, 25], "lab": [110, 185, 140], "hsv": [177, 230, 170]},
        {"face": "left", "name": "orange", "rgb": [245, 90, 10], "lab": [150, 165, 180], "hsv": [10, 245, 245]}
    ]
    # Test that the dark blue sticker matches calibrated blue even at L=22
    dark_blue_sample = [6, 22, 70] # RGB
    bgr = np.uint8([[[dark_blue_sample[2], dark_blue_sample[1], dark_blue_sample[0]]]])
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2Lab)[0][0]
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)[0][0]
    cal_detected = classify_color_lab(lab.tolist(), custom_palette=custom_palette, target_rgb=dark_blue_sample, target_hsv=hsv.tolist())
    print(f"Dark blue sample with calibration -> '{cal_detected}'")
    assert cal_detected == 'blue', "Calibrated dark blue must match 'blue'!"

    # CRITICAL: Test that user's brown [122, 85, 73] and gray [46, 50, 48] NEVER match White when calibrated!
    for non_cube in [user_brown_rgb, user_grey_rgb]:
        bgr = np.uint8([[[non_cube[2], non_cube[1], non_cube[0]]]])
        lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2Lab)[0][0]
        hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)[0][0]
        non_cube_res = classify_color_lab(lab.tolist(), custom_palette=custom_palette, target_rgb=non_cube, target_hsv=hsv.tolist())
        print(f"Non-cube {non_cube} with calibration -> '{non_cube_res}' (MUST BE 'unknown')")
        assert non_cube_res == 'unknown', f"Non-cube {non_cube} must NOT match White when calibrated!"

    # Test classic cube colors (Image 5)
    classic_samples = {
        'classic_red': [155, 25, 30],
        'classic_yellow': [205, 175, 25],
        'classic_green': [15, 125, 45],
        'classic_blue': [15, 45, 125],
        'classic_white': [210, 215, 220],
        'classic_orange': [225, 85, 15]
    }
    print("\n=== TEST 5b: Classic Cube Recognition ===")
    for expected, rgb in classic_samples.items():
        exp_color = expected.replace('classic_', '')
        bgr = np.uint8([[[rgb[2], rgb[1], rgb[0]]]])
        lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2Lab)[0][0]
        hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)[0][0]
        det = classify_color_lab(lab.tolist(), target_rgb=rgb, target_hsv=hsv.tolist())
        print(f"Classic {exp_color} {rgb} -> '{det}'")
        assert det == exp_color, f"Classic {exp_color} failed, got {det}"

    print("\n=== TEST 5c: Cool-Tinted White Under Screen Light ===")
    cool_white_samples = [
        [135, 140, 155], # Screen cool glow reflection
        [120, 130, 160], # Dim screen cool white
        [130, 140, 165], # Subtle cyan-tinted white
        [160, 160, 165]  # Speedcube white
    ]
    for cw in cool_white_samples:
        bgr = np.uint8([[[cw[2], cw[1], cw[0]]]])
        lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2Lab)[0][0]
        hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)[0][0]
        # Must be white with calibration, and MUST NEVER be blue!
        det_cal = classify_color_lab(lab.tolist(), custom_palette=custom_palette, target_rgb=cw, target_hsv=hsv.tolist())
        print(f"Cool white {cw} with calibration -> '{det_cal}'")
        assert det_cal != 'blue', f"Cool white {cw} must NEVER be misclassified as blue!"
        assert det_cal in ('white', 'unknown'), f"Cool white should be white or unknown, got {det_cal}"

    print("\n=== TEST 5d: Classic Vintage Dark Green Vinyl Sticker ===")
    vintage_green_rgb = [37, 64, 57] # Sampled directly from user's classic cube photo
    bgr = np.uint8([[[vintage_green_rgb[2], vintage_green_rgb[1], vintage_green_rgb[0]]]])
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2Lab)[0][0]
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)[0][0]
    # In uncalibrated mode:
    det_uncal = classify_color_lab(lab.tolist(), target_rgb=vintage_green_rgb, target_hsv=hsv.tolist())
    print(f"Vintage dark green {vintage_green_rgb} uncalibrated -> '{det_uncal}'")
    assert det_uncal == 'green', f"Vintage dark green must be 'green', got {det_uncal}"

    # In calibrated mode:
    classic_palette = [
        {"face": "up", "name": "white", "rgb": [190, 190, 190], "lab": [175, 128, 128], "hsv": [0, 0, 190]},
        {"face": "down", "name": "yellow", "rgb": [210, 200, 30], "lab": [190, 125, 185], "hsv": [28, 220, 210]},
        {"face": "front", "name": "green", "rgb": [37, 64, 57], "lab": [63, 116, 129], "hsv": [82, 108, 64]},
        {"face": "back", "name": "blue", "rgb": [15, 45, 125], "lab": [45, 135, 75], "hsv": [110, 235, 125]},
        {"face": "right", "name": "red", "rgb": [170, 30, 35], "lab": [100, 175, 140], "hsv": [177, 210, 170]},
        {"face": "left", "name": "orange", "rgb": [210, 95, 20], "lab": [145, 165, 175], "hsv": [11, 230, 210]}
    ]
    det_cal = classify_color_lab(lab.tolist(), custom_palette=classic_palette, target_rgb=vintage_green_rgb, target_hsv=hsv.tolist())
    print(f"Vintage dark green {vintage_green_rgb} calibrated -> '{det_cal}'")
    assert det_cal == 'green', f"Calibrated vintage green must be 'green', got {det_cal}"

    print("\n=== TEST 6: Strict 9-Sticker Gating in scan-raw ===")
    reset()
    # Create image with 8 green stickers and 1 brown/unknown sticker
    partial_face = make_cube_image([73, 85, 122], [70, 180, 0]) # center is brown
    b64_partial = to_base64(partial_face)
    res_gating = scan_raw(ImageInput(image=b64_partial, face_name="auto", preview=True))
    print(f"Partial face (8/9 valid) -> success={res_gating['success']}, message='{res_gating['message']}', valid_count={res_gating['valid_count']}")
    assert not res_gating['success'], "Should not succeed with fewer than 9 valid stickers!"
    assert res_gating['valid_count'] == 8, f"Expected 8 valid stickers, got {res_gating['valid_count']}"

    # Fully valid face (9 green stickers, BGR [70, 180, 0])
    valid_face = make_cube_image([70, 180, 0], [70, 180, 0])
    b64_valid = to_base64(valid_face)
    res_valid = scan_raw(ImageInput(image=b64_valid, face_name="auto", preview=True))
    print(f"Valid face (9/9 valid) -> success={res_valid['success']}, message='{res_valid['message']}', valid_count={res_valid['valid_count']}")
    assert res_valid['success'], "Should succeed when all 9 stickers are valid!"
    assert res_valid['valid_count'] == 9, "Should report 9 valid stickers"

    print("\n=== TEST 7: Kociemba Solver Parity & Chirality Integrity ===")
    import kociemba
    # Standard valid scrambled cube state:
    valid_state = "DUUBULDBFRBFRRULLLBRDFFFBLURDBFDFDRFRULBLUFDURRBLBDUDL"
    sol = kociemba.solve(valid_state)
    print(f"Unmirrored valid state solved -> {sol[:24]}...")
    assert len(sol) > 0, "Valid cube state must be solvable by Kociemba!"

    # Verify that reflecting columns flips parity and causes Kociemba failure:
    faces = [valid_state[i*9:(i+1)*9] for i in range(6)]
    mirrored_faces = [f[2] + f[1] + f[0] + f[5] + f[4] + f[3] + f[8] + f[7] + f[6] for f in faces]
    mirrored_state = "".join(mirrored_faces)
    try:
        kociemba.solve(mirrored_state)
        mirrored_solvable = True
    except Exception:
        mirrored_solvable = False
    print(f"Mirrored cube state solvable: {mirrored_solvable} (MUST BE False due to chirality inversion)")
    assert not mirrored_solvable, "Mirrored cube must fail in Kociemba, confirming why canvas mirroring was breaking the solver!"

    print("\n=== ALL TEST SUITES PASSED! ===")

if __name__ == '__main__':
    run_tests()
