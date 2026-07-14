# Sample images / 样例图片

Uploaded to the source bucket (`helloworld-334009-dit-source`) during deployment; used by
the e2e suite and the storyline walkthrough.

| File | Purpose |
|---|---|
| `landscape.jpg` (1200×800) | resize / format / quality / overlay base image |
| `mona-lisa.jpg` (960×1431) | smart crop (public-domain portrait, Vision detects the face) |
| `logo.png` (300×100, alpha) | watermark / overlayWith source |
| `solid.png` (400×300) | simple edits, round crop |
| `animated.gif` (160×120, 3 frames) | animated GIF passthrough & edit-skip behavior |

`gen-samples.js` regenerates the synthetic images (sharp); `animated.gif` was produced with
Pillow (`Image.save(save_all=True, ...)`); `mona-lisa.jpg` is public domain via Wikimedia
Commons (Special:FilePath download, reduced to 800px width).
