class CubeMapper:
    def __init__(self):
        # Stores the 9 stickers for each face
        # Keys will be the center colors: 'white', 'yellow', 'green', 'blue', 'red', 'orange'
        self.faces = {}

        # Standard Kociemba face order: U, R, F, D, L, B
        # We map center colors to these letters
        self.color_to_notation = {
            'white': 'U',
            'red': 'R',
            'green': 'F',
            'yellow': 'D',
            'orange': 'L',
            'blue': 'B',
        }

    def add_face(self, center_color: str, stickers: list):
        """
        center_color: The color of the middle sticker (defines the face)
        stickers: List of 9 colors (strings) reading left-to-right, top-to-bottom
        """
        if len(stickers) != 9:
            raise ValueError("Invalid scan: Face must have exactly 9 stickers.")

        # Verify the center sticker matches the declared face color (sanity check)
        # Index 4 is the center of a 0-indexed list (0..8)
        if stickers[4] != center_color:
            raise ValueError(f"Scan error: Center sticker is {stickers[4]}, but expected {center_color}.")

        self.faces[center_color] = stickers

    def is_complete(self):
        # We need all 6 centers to be present
        required_centers = {'white', 'green', 'red', 'yellow', 'blue', 'orange'}
        return required_centers.issubset(self.faces.keys())

    def get_kociemba_string(self):
        """
        Converts the stored color data into the 54-char string U...R...F...D...L...B...
        """
        if not self.is_complete():
            raise ValueError("Cannot solve: Missing faces.")

        # The specific order Kociemba needs: U, R, F, D, L, B
        # NOTE: This order is critical.
        face_order = ['white', 'red', 'green', 'yellow', 'orange', 'blue']

        full_string = ""

        for center in face_order:
            face_stickers = self.faces[center]
            # Convert color names to notation letters (e.g., 'white' -> 'U')
            for color in face_stickers:
                if color not in self.color_to_notation:
                    # Fallback or error if an unknown color like 'purple' slips in
                    raise ValueError(f"Unknown color detected: {color}")
                full_string += self.color_to_notation[color]

        return full_string