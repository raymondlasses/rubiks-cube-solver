from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
from cv_utils import extract_face_features, classify_entire_cube, classify_color_lab
from collections import Counter

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

raw_scans = {}


class ImageInput(BaseModel):
    image: str
    face_name: str = "auto"
    preview: bool = False
    custom_palette: list[dict] = None
    picker_mode: bool = False


@app.post("/scan-raw")
def scan_raw(data: ImageInput):
    try:
        features = extract_face_features(data.image)

        valid_count = 0
        for f in features:
            lab = np.array(f['lab'])
            color = classify_color_lab(lab, data.custom_palette)
            if color != 'unknown':
                valid_count += 1

        # --- STRICTER GATEKEEPER ---
        # If less than 7 valid colors are detected, outright reject it (fixes the bad shadow/backlight issue)
        if valid_count < 7 and not data.picker_mode:
            return {"success": False, "message": "Poor lighting / Align cube"}

        has_warnings = valid_count < 9

        center_feature = features[4]
        center_lab = np.array(center_feature['lab'])
        center_color_name = classify_color_lab(center_lab, data.custom_palette)

        if center_color_name == 'unknown' and not data.picker_mode:
            return {"success": False, "message": "Center unclear"}

        if data.custom_palette:
            color_to_face = {c['name']: c['face'] for c in data.custom_palette}
        else:
            color_to_face = {
                'white': 'up', 'yellow': 'down', 'green': 'front',
                'blue': 'back', 'red': 'right', 'orange': 'left'
            }

        detected_face = "unknown"
        if data.face_name != "auto":
            detected_face = data.face_name
        elif center_color_name in color_to_face:
            detected_face = color_to_face[center_color_name]

        if not data.preview and not data.picker_mode:
            if detected_face != "unknown":
                raw_scans[detected_face] = features

        return {
            "success": True,
            "message": f"Detected {detected_face.upper()}",
            "face_name": detected_face,
            "rgb_preview": [f['rgb'] for f in features],
            "raw_features": features,
            "scanned_count": len(raw_scans),
            "has_warnings": has_warnings
        }

    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/solve-global")
def solve_global():
    kociemba_order = ['up', 'right', 'front', 'down', 'left', 'back']
    missing = [f for f in kociemba_order if f not in raw_scans]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing faces: {', '.join(missing)}")
    try:
        ordered_features = []
        for face in kociemba_order:
            ordered_features.extend(raw_scans[face])

        classified_faces = classify_entire_cube(ordered_features)

        face_to_kociemba = {'up': 'U', 'front': 'F', 'right': 'R', 'down': 'D', 'left': 'L', 'back': 'B'}
        kociemba_to_face = {v: k for k, v in face_to_kociemba.items()}

        solution_string = "".join([face_to_kociemba[face] for face in classified_faces])

        import kociemba

        counts = Counter(solution_string)
        errors = sum(max(0, counts[c] - 9) for c in 'URFDLB')

        corrected_faces = classified_faces

        if errors == 0:
            try:
                solution = kociemba.solve(solution_string)
            except Exception:
                raise HTTPException(status_code=400,
                                    detail="Cube scanned successfully but is physically unsolvable (twisted corner/edge).")
        elif errors <= 4:
            def get_balanced(curr_s, curr_counts):
                surplus = [c for c in 'URFDLB' if curr_counts[c] > 9]
                deficit = [c for c in 'URFDLB' if curr_counts[c] < 9]
                if not surplus:
                    yield curr_s
                    return
                sc, dc = surplus[0], deficit[0]
                for i, c in enumerate(curr_s):
                    if c == sc and i not in [4, 13, 22, 31, 40, 49]:
                        new_s = curr_s[:i] + dc + curr_s[i + 1:]
                        new_counts = curr_counts.copy()
                        new_counts[sc] -= 1
                        new_counts[dc] += 1
                        yield from get_balanced(new_s, new_counts)

            candidates = set(get_balanced(solution_string, counts))
            solvable = []

            for cand in candidates:
                try:
                    sol = kociemba.solve(cand)
                    solvable.append((cand, sol))
                except:
                    pass

            if len(solvable) == 1:
                solution_string, solution = solvable[0]
                corrected_faces = [kociemba_to_face[c] for c in solution_string]
            elif len(solvable) > 1:
                raise HTTPException(status_code=400,
                                    detail="Multiple scan corrections possible. Please check red warnings and rescan.")
            else:
                raise HTTPException(status_code=400,
                                    detail="Scan invalid and auto-correction failed. Please rescan tricky faces.")
        else:
            raise HTTPException(status_code=400,
                                detail="Too many scanning errors. Please check red warnings and rescan.")

        is_solved = True
        chunks = [solution_string[i:i + 9] for i in range(0, 54, 9)]
        for chunk in chunks:
            if len(set(chunk)) > 1:
                is_solved = False
                break

        if is_solved:
            solution = "Good news, the cube is solved. Bad news, you may be colorblind."
        else:
            solution = solution.replace('3', "'")

        return {
            "solution": solution,
            "parsed_colors": corrected_faces
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Solver Error: {str(e)}")


@app.post("/reset")
def reset():
    raw_scans.clear()
    return {"message": "Reset done"}