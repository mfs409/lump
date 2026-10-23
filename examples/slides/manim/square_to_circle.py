r"""The animation of slide 2 of example.md, as Python Manim.

Python is only needed to (re)render the video, but it's nice to see the whole process.
This is the script that generates the video.  To use it, first you'll need to install
the necessary dependencies:

- You need python 3.11 or newer
- You need ffmpeg, latex, and dvisgm on your PATH
- Latex will need the standalone class and the usual math packages
- Then run these commands (Linux only)
    python3 -m venv .venv
    . .venv/bin/activate
    pip install manim

To render a short, low-res clip, you can do this:

    manim -ql -r 640,360 --fps 15 --media_dir media square_to_circle.py SquareToCircle

This will make media/videos/square_to_circle/360p15/SquareToCircle.mp4.
You will probably want to copy it over to a better place, like public/videos/square_to_circle.mp4.

Also, be sure to gitignore the .venv, media and __pycache__ folders
"""
from manim import *


class SquareToCircle(Scene):
    def construct(self):
        square = Square(side_length=2, color=BLUE).set_fill(BLUE, opacity=0.5)
        circle = Circle(radius=1.5, color=PINK).set_fill(PINK, opacity=0.5)
        title = Text("Square to circle", font_size=36).to_edge(UP)
        # (raised from the bottom edge, so the video player's controls on
        # slide 2 do not cover the equation)
        area_square = MathTex(r"A = s^2").to_edge(DOWN, buff=1.2)
        area_circle = MathTex(r"A = \pi r^2").to_edge(DOWN, buff=1.2)

        self.play(Create(square), run_time=1)
        self.play(FadeIn(title), Write(area_square), run_time=1)
        self.wait(0.5)
        self.play(Transform(square, circle), Transform(area_square, area_circle), run_time=1.5)
        self.wait(0.5)
