# Harmony Photo Editor

A browser-based photo editor that **detects a photo's colour harmony automatically** and lets you **change the intensity of individual colours, selected objects, the sky and greenery**, while keeping **people's faces and skin untouched**.

Everything runs in the browser. Photos are never uploaded anywhere.

---

## Features

| Feature | What it does |
| --- | --- |
| **Automatic colour detection** | Finds the main colours in the photo and names them (Blue 59%, Orange 19%…). |
| **Colour-harmony detection** | Classifies the photo as Complementary, Split-complementary, Analogous, Monochromatic, Triadic or Mixed. Shows a confidence score and a plain-English explanation, and draws the harmony on a 12-slot colour wheel. |
| **Per-colour intensity** | Each detected colour has a slider from −100 (grey) to +100 (richer). Only that colour changes. |
| **Drag on the photo** | With the **Colour** tool, press on any colour in the photo and drag right/up to strengthen it or left/down to fade it. |
| **Object selection** | With the **Object** tool, click an object (a car, a shirt, a flower) to select it, then drag or use its slider. You can select up to 4 objects. |
| **Sky** | The sky is found automatically. It has an **Intensity** slider and a **Tone** slider (Cooler ↔ Warmer). |
| **Greenery** | Trees, grass and plants are found automatically. They have an **Intensity** slider and a **Tone** slider (Golden ↔ Lush). |
| **People protection** | Faces are always left untouched. Skin and hair are protected by default and can be switched off. Clothes stay editable. |
| **Realistic results** | Uses a perceptual colour space, a vibrance-style boost and a soft gamut roll-off, so colours never clip into neon or posterised patches. |
| **Compare** | Split view with a draggable divider, or hold a button (or the `\` key) to see the original. |
| **Undo / redo** | Every finished edit can be undone and redone. |
| **Export** | Save a full-resolution JPG (quality 92) or PNG. |

---

## Quick start

You need **Node.js 18 or newer**.

```bash
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173). The app opens with a sample photo so you can try it straight away. Use **Open photo** or drag a photo onto the window to edit your own.

### Production build

```bash
npm run build     # type-checks, then writes a static site to dist/
npm run preview   # serves dist/ locally to check the build
```

`dist/` is a plain static site. You can host it anywhere that serves static files: Netlify, Vercel, GitHub Pages, S3, nginx and so on.

### Standalone version

`standalone/harmony-photo-editor.html` is the same editor in a single file with no build step. Double-click it to open it in Chrome or Edge. It's handy for quick sharing; the React project is the one to develop.

---

## AI models and running offline

The app uses three free [MediaPipe](https://developers.google.com/mediapipe) models:

| Model | Used for |
| --- | --- |
| `selfie_multiclass_256x256` | Labels each pixel as background, hair, body skin, face skin, clothes or other. |
| `blaze_face_short_range` | Detects faces, as an extra safety net for face protection. |
| `magic_touch` | Returns the object under a clicked point (Object tool). |

By default, the app downloads the MediaPipe WASM runtime from jsDelivr and the models from Google's model storage the first time it runs. The browser then caches them.

To host everything yourself (for offline use, strict firewalls or faster loading):

```bash
npm run setup:offline      # copies the WASM runtime to public/mediapipe/wasm and downloads the models to public/models
cp .env.example .env       # then uncomment the two lines in .env
npm run dev
```

**If the models can't load, the app still works.** It falls back to non-AI methods:

- Person protection uses skin-tone detection.
- Object selection selects by colour.

The **People protection** panel shows which method is active, and objects selected by colour are labelled "by colour".

---

## How to use

1. **Open a photo.** The colour wheel, harmony name, colours, sky and greenery fill in automatically.
2. **Adjust a colour.** Drag its slider, or pick the **Colour** tool and drag directly on the photo.
3. **Adjust one object.** Pick the **Object** tool, click the object, then drag. Hover over the object's entry in the panel to highlight it on the photo. Click **×** to remove it.
4. **Adjust the sky or greenery.** Use the sliders in the **Nature** panel. Turn on **Show detected areas** to see exactly what they will change.
5. **Check people.** Turn on **Show protected areas** to see what is protected (shown in pink).
6. **Compare and export.** Use **Split view** or **Hold for original**, then **Export JPG** or **PNG**.

### Shortcuts

| Key | Action |
| --- | --- |
| `C` | Colour tool |
| `O` | Object tool |
| `Ctrl/⌘ + Z` | Undo |
| `Ctrl/⌘ + Shift + Z` or `Ctrl + Y` | Redo |
| hold `\` | Show the original |
| double-click a slider | Reset it to 0 |

---

## How it works

When a photo is opened, the app runs this pipeline:

```
photo ─► working copy (≤1024 px) ─► people ─► protection mask ─► sky ─► greenery ─► colours ─► harmony
                                                                         │
full-resolution photo ─► WebGL texture ◄──── masks packed into textures ─┘
                                 │
                   slider values ─► fragment shader ─► preview / full-resolution export
```

All analysis runs once, on a downscaled copy of the photo. After that, every slider move only changes a few shader uniforms, so edits update in real time even on large photos.

### 1. Colour detection (`src/lib/colourAnalysis.ts`)

- The app samples about 60,000 pixels, skipping protected people.
- It drops greys, near-blacks and near-whites, because they have no hue to adjust.
- It runs **k-means (k = 8) in OKLab**, with lightness down-weighted so the clusters split by hue rather than brightness.
- Clusters in the same hue family are merged, and families that cover less than 3% of the photo are dropped.

### 2. Harmony (`src/lib/harmony.ts`)

Hues are placed on a **12-slot artist's wheel** (Red, Red-orange, Orange … Magenta). The wheel is anchored so that the opposites painters expect hold true: blue↔orange, red↔green and yellow↔violet. Hues within 30° are grouped together, and the main groups (each at least 10% of the colour) are compared:

| Harmony | Rule |
| --- | --- |
| Monochromatic | All main hues within about 30° |
| Complementary | Two groups about 180° apart (±25°) |
| Analogous | All main hues within about 90° |
| Triadic | Three groups about 120° apart (±25°) |
| Split-complementary | One hue plus two hues about 150° away from it on each side |
| Mixed | None of the above |

Confidence combines how closely the angles fit the rule with how much of the photo those hues cover.

### 3. Intensity maths and realism (`src/lib/shaders.ts`)

Each pixel is converted to **OKLab/OKLCH**, a perceptual colour space where *C* (chroma) is colour intensity:

- **Selecting a colour:** a smooth raised-cosine weight (±25°) around each colour's hue means only that colour changes, with no hard edges.
- **Fading:** chroma is scaled down towards grey, and −100 means fully grey.
- **Strengthening:** a vibrance-style boost that is smaller for colours that are already strong, capped per step.
- **Lightness:** it shifts slightly as colours get richer, which is how real saturated colours behave.
- **Soft gamut roll-off:** the shader finds the most colourful value the screen can show in that direction and eases into it. That's why boosted colours never clip into flat patches.
- **Sky tone:** works like white balance applied only to the sky, not a hue swap. A stronger sky darkens slightly, like a polarising filter, but the sun and sunset glow are left alone.
- **Greenery tone:** turns the hue gently, by at most about 17°, towards golden or lush.
- **Protection:** the final pixel is `mix(edited, original, protectionMask)`, so protected areas are always the original pixels.

### 4. People protection (`src/lib/people.ts`)

- **With AI:** the multiclass selfie model gives face skin, body skin, hair and clothes separately. Face skin is always protected, body skin and hair are optional, and clothes are editable. Every detected face also gets a feathered ellipse, 15% larger than the face box.
- **Without AI:** a YCbCr skin-tone test, tightened so that vivid oranges such as sunsets aren't mistaken for skin. The sky is found first, and skin inside it is ignored.
- The protection mask is grown slightly and feathered (a Gaussian blur of about 0.5% of the image size) so there is no visible seam.

### 5. Sky (`src/lib/nature.ts`)

- The app finds pixels that are smooth (low local gradient), bright and not green. That covers blue sky, overcast grey and sunset orange or pink.
- It grows the sky downward from the top edge through those pixels, stopping at colour edges such as the horizon or rooftops.
- It adds blue patches seen through trees if they match the main sky's colour.
- People, clothes included, are always excluded.

### 6. Greenery (`src/lib/nature.ts`)

- The app looks for pixels whose OKLab hue is close to foliage green (about 135°).
- It weights them by **texture** (the standard deviation of lightness in a 5×5 window), because leaves and grass are textured while painted walls and cars are smooth.
- The result is smoothed into a soft region. In the shader, only pixels whose own hue is green are changed, so brown trunks and flowers in a hedge keep their colour.

### 7. Objects (`src/lib/objects.ts`)

- **With AI:** the Magic Touch model returns the object under the click.
- **Without AI:** a flood fill grows from the clicked pixel while the colour stays close to both its neighbour and the region's running average.
- Up to 4 object masks are packed into one RGBA texture, one per channel.

---

## Project structure

```
harmony-photo-editor/
├── index.html                 Page shell and fonts
├── package.json               Scripts and dependencies
├── vite.config.ts             Vite + React plugin
├── tsconfig.json              Strict TypeScript settings
├── .env.example               Optional self-hosting settings
├── scripts/
│   └── setup-offline.mjs      Copies the WASM runtime and downloads the models into public/
├── public/
│   ├── favicon.svg
│   └── models/                Self-hosted models go here (optional)
├── standalone/
│   └── harmony-photo-editor.html   Single-file version, no build needed
└── src/
    ├── main.tsx               React entry point
    ├── App.tsx                App state, photo pipeline, editing, undo/redo, export
    ├── styles.css             All styles (dark "darkroom" theme)
    ├── config.ts              Model URLs and limits
    ├── types.ts               Shared types
    ├── hooks/
    │   └── useHistory.ts      Undo/redo stack
    ├── components/
    │   ├── TopBar.tsx         Open, tools, undo, compare, export
    │   ├── Stage.tsx          Canvas, fit-to-screen, drag-on-photo, split view, overlays
    │   ├── HarmonyPanel.tsx   Harmony name, confidence and explanation
    │   ├── ColourWheel.tsx    12-slot wheel with detected colours
    │   ├── ColoursPanel.tsx   Per-colour sliders
    │   ├── NaturePanel.tsx    Sky and greenery sliders
    │   ├── ObjectsPanel.tsx   Selected objects and their sliders
    │   ├── PeoplePanel.tsx    Protection switches and AI status
    │   ├── Slider.tsx         −100…+100 slider
    │   └── Toggle.tsx         Switch
    └── lib/
        ├── pipeline.ts        Runs the full analysis when a photo opens
        ├── color.ts           sRGB ↔ OKLab, HSL hue, artist's wheel
        ├── colourAnalysis.ts  k-means colour detection
        ├── harmony.ts         Harmony classification and descriptions
        ├── people.ts          Person detection and protection mask
        ├── nature.ts          Sky and greenery detection
        ├── objects.ts         Click-to-select objects
        ├── models.ts          Lazy MediaPipe loading with timeouts and fallbacks
        ├── masks.ts           Blur, dilate, flood-fill helpers
        ├── image.ts           File decoding, working copy, sample photo
        ├── shaders.ts         GLSL for the preview and export
        └── webglRenderer.ts   WebGL setup, textures, drawing, export
```

---

## Configuration

These settings live in `src/config.ts`:

| Setting | Default | Meaning |
| --- | --- | --- |
| `WORK_SIZE` | `1024` | Long side of the analysis copy. Higher values give finer masks but slower loading. |
| `MAX_CLUSTERS` | `8` | Most colour families shown. |
| `MAX_OBJECTS` | `4` | Most selected objects (limited by the RGBA texture). |
| `MODEL_TIMEOUT_MS` | `25000` | How long to wait for a model before falling back. |

Environment variables (see `.env.example`):

| Variable | Meaning |
| --- | --- |
| `VITE_MEDIAPIPE_WASM` | Where to load the MediaPipe WASM runtime from (e.g. `/mediapipe/wasm`). |
| `VITE_MODEL_BASE` | Folder that holds the three `.tflite` models (e.g. `/models`). |

The realism limits (how far a boost or tone shift can go) are the numbers in `src/lib/shaders.ts`. Each one has a comment next to it.

---

## Browser support

- **Supported:** recent Chrome, Edge, Firefox and Safari with WebGL. WebGL2 is used when available, for sharper previews through mipmaps.
- **HEIC photos** open only where the browser can decode them (mainly Safari). Elsewhere, save them as JPG first.
- **Very large photos** are capped at the GPU's maximum texture size (usually 8192 or 16384 px on the long side), and export happens at that size.

## Privacy

Photos are decoded, analysed and edited entirely in the browser. Nothing is uploaded. The only network requests are for fonts, the MediaPipe runtime and the models, and you can self-host all of these.

---

## Known limitations

- **Sky and greenery** are detected from colour, texture and position, not by an AI model. They can be tricked by hazy horizons that blend into the sea, or by large smooth green objects that aren't plants. Check them with **Show detected areas**.
- **Very saturated colours** (a bright orange boat, for example) can't get much stronger without looking fake, so the boost eases off. Fading them works fully.
- **The skin-tone fallback** (used when AI models can't load) is less precise than the AI model. It may protect some skin-coloured objects or miss skin in unusual lighting.
- **The face detector** is the short-range model, which is best for faces that fill a reasonable part of the frame. Very small faces in wide shots rely on the segmenter alone.
- **Undo/redo** covers slider values. Adding or removing an object is not itself undoable.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "AI person detection couldn't load" | You're offline, or a firewall blocks jsDelivr or storage.googleapis.com. Use `npm run setup:offline`. |
| Blank canvas or "WebGL is not available" | Turn on hardware acceleration in your browser settings, or try another browser. |
| A photo won't open | The browser can't decode the format. Save it as JPG or PNG. |
| Edits look too subtle | The colour may already be near its limit, or most of it may be protected. Check with **Show protected areas**. |

## Ideas for extending

- Add an AI sky/vegetation segmenter (for example, a DeepLab model trained on ADE20K) in place of the colour-based detection.
- Add a hue-shift slider per colour, keeping the same gamut roll-off.
- Save and load edit presets (the `Adjustments` object is plain JSON).
- Process photos in a Web Worker so very large photos never block the page while loading.

## Credits

- [MediaPipe Tasks Vision](https://developers.google.com/mediapipe/solutions/vision) (Apache 2.0) for person segmentation, face detection and interactive segmentation.
- [OKLab](https://bottosson.github.io/posts/oklab/) colour space by Björn Ottosson.
- Fonts: Bricolage Grotesque and IBM Plex (SIL Open Font License), from Google Fonts.
