from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from collections import Counter
import kociemba
import numpy as np

from cv_utils import extract_face_features, classify_entire_cube, classify_color_lab

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

raw_scans = {}


@app.get("/")
def root():
    return {
        "status": "online",
        "service": "Rubik's Solver AI Backend",
        "docs": "/docs"
    }


class ImageInput(BaseModel):
    image: str
    face_name: str = "auto"
    preview: bool = False
    custom_palette: list[dict] | None = None
    picker_mode: bool = False


class SolveInput(BaseModel):
    custom_palette: list[dict] | None = None


@app.post("/scan-raw")
def scan_raw(data: ImageInput):
    try:
        extraction = extract_face_features(data.image, data.custom_palette)
        features = extraction['features']
        is_cube_present = extraction['is_cube_present']
        presence_score = extraction['presence_score']
        presence_reason = extraction['presence_reason']

        # 1. Cube Presence Gatekeeper: reject flat surfaces (curtains, blank walls)
        if not is_cube_present and not data.picker_mode:
            return {
                "success": False,
                "message": "Align cube in grid",
                "cube_present": False,
                "presence_score": presence_score,
                "valid_count": 0,
                "reason": presence_reason
            }

        valid_count = sum(1 for f in features if f.get('color') != 'unknown')

        # 2. Strict 9-Sticker Color Validity Gatekeeper: only scan when all 9 are valid
        if valid_count < 9 and not data.picker_mode:
            return {
                "success": False,
                "message": f"Aligning face ({valid_count}/9 colors valid)",
                "cube_present": True,
                "presence_score": presence_score,
                "valid_count": valid_count,
                "diagnostics": {
                    "detected_colors": [f['color'] for f in features],
                    "hue_angles": [f['hue_angle'] for f in features]
                }
            }

        center_feature = features[4]
        center_color_name = center_feature.get('color', 'unknown')

        if center_color_name == 'unknown' and not data.picker_mode:
            return {
                "success": False,
                "message": "Center sticker unclear",
                "cube_present": True,
                "presence_score": presence_score,
                "valid_count": valid_count
            }

        if data.custom_palette:
            color_to_face = {str(c.get('name', '')).lower(): c.get('face') for c in data.custom_palette if 'face' in c}
        else:
            color_to_face = {
                'white': 'up', 'yellow': 'down', 'green': 'front',
                'blue': 'back', 'red': 'right', 'orange': 'left'
            }

        detected_face = "unknown"
        if data.face_name != "auto":
            detected_face = data.face_name
        elif center_color_name.lower() in color_to_face:
            detected_face = color_to_face[center_color_name.lower()]

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
            "has_warnings": False,
            "cube_present": True,
            "presence_score": presence_score,
            "valid_count": valid_count,
            "diagnostics": {
                "detected_colors": [f['color'] for f in features],
                "hue_angles": [f['hue_angle'] for f in features]
            }
        }

    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/solve-global")
def solve_global(data: SolveInput | None = None):
    kociemba_order = ['up', 'right', 'front', 'down', 'left', 'back']
    missing = [f for f in kociemba_order if f not in raw_scans]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing faces: {', '.join(missing)}")
    try:
        ordered_features = []
        for face in kociemba_order:
            ordered_features.extend(raw_scans[face])

        custom_palette = data.custom_palette if data else None
        classified_faces = classify_entire_cube(ordered_features, custom_palette=custom_palette)

        face_to_kociemba = {'up': 'U', 'front': 'F', 'right': 'R', 'down': 'D', 'left': 'L', 'back': 'B'}
        kociemba_to_face = {v: k for k, v in face_to_kociemba.items()}

        if any(face not in face_to_kociemba for face in classified_faces):
            raise HTTPException(
                status_code=400,
                detail="Color classification was ambiguous on one or more stickers. Please verify lighting and rescan."
            )

        solution_string = "".join([face_to_kociemba[face] for face in classified_faces])

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


@app.post("/calibrate-face")
def calibrate_face(data: ImageInput):
    try:
        extraction = extract_face_features(data.image)
        features = extraction['features']
        center = features[4]
        return {
            "success": True,
            "center": center,
            "all_stickers": features,
            "is_cube_present": extraction['is_cube_present'],
            "presence_score": extraction['presence_score'],
            "presence_reason": extraction['presence_reason']
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))