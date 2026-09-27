/**
 * GLSL for the live preview and the full-resolution export.
 * Written in GLSL ES 1.00 so it runs on both WebGL1 and WebGL2.
 *
 * Every pixel is converted to OKLab, where
 *   L = lightness, C = chroma (colour intensity), h = hue angle.
 * "Intensity" edits change C (and a little L); tone edits turn the hue or shift a/b.
 */
export const VERTEX_SHADER = `
attribute vec2 p;
varying vec2 vUv;
void main() {
  vUv = vec2((p.x + 1.) * .5, (1. - p.y) * .5);
  gl_Position = vec4(p, 0., 1.);
}`;

export const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;

uniform sampler2D uImg;   // the photo
uniform sampler2D uMask;  // r = protected people, g = greenery area, b = sky area
uniform sampler2D uObj;   // one selected object per channel (up to 4)

uniform float uHue[8];    // centre hue (radians, OKLab) of each detected colour
uniform float uAmt[8];    // its intensity, -1..1
uniform int uN;           // how many colours are in use
uniform float uWidth;     // half-width of each colour's hue band (radians)

uniform float uSA, uST;   // sky intensity and tone (cooler..warmer)
uniform float uGA, uGT;   // greenery intensity and tone (golden..lush)
uniform vec4 uOA;         // object intensities
uniform vec4 uHi;         // objects to highlight

uniform float uShowMask, uShowAreas, uSplit, uOrig;

vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), step(.04045, c)); }
vec3 toSrgb(vec3 c) { c = clamp(c, 0., 1.); return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }

vec3 lin2lab(vec3 c) {
  float l = pow(max(.4122214708 * c.r + .5363325363 * c.g + .0514459929 * c.b, 0.), 1. / 3.);
  float m = pow(max(.2119034982 * c.r + .6806995451 * c.g + .1073969566 * c.b, 0.), 1. / 3.);
  float s = pow(max(.0883024619 * c.r + .2817188376 * c.g + .6299787005 * c.b, 0.), 1. / 3.);
  return vec3(.2104542553 * l + .7936177850 * m - .0040720468 * s,
              1.9779984951 * l - 2.4285922050 * m + .4505937099 * s,
              .0259040371 * l + .7827717662 * m - .8086757660 * s);
}
vec3 lab2lin(vec3 c) {
  float l = c.x + .3963377774 * c.y + .2158037573 * c.z;
  float m = c.x - .1055613458 * c.y - .0638541728 * c.z;
  float s = c.x - .0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return vec3(4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
              -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
              -.0041960863 * l - .7034186147 * m + 1.7076147010 * s);
}
bool outOfGamut(vec3 v) { return any(lessThan(v, vec3(-.001))) || any(greaterThan(v, vec3(1.001))); }

void main() {
  vec3 src = texture2D(uImg, vUv).rgb;
  vec4 mk = texture2D(uMask, vUv);
  vec4 ob = texture2D(uObj, vUv);
  float prot = mk.r;

  vec3 lab = lin2lab(toLin(src));
  float C = length(lab.yz), h = atan(lab.z, lab.y);
  float cw = smoothstep(.012, .06, C);          // near-grey pixels barely change

  // 1. Colour families: smooth raised-cosine weight around each colour's hue
  float dc = 0.;
  for (int i = 0; i < 8; i++) {
    if (i >= uN) break;
    float dh = abs(h - uHue[i]); dh = min(dh, 6.2831853 - dh);
    dc += (dh < uWidth ? .5 + .5 * cos(3.14159265 * dh / uWidth) : 0.) * uAmt[i];
  }
  // 2. Greenery: inside the detected area, only pixels whose hue is really green (~135°)
  float gh = abs(h - 2.36); gh = min(gh, 6.2831853 - gh);
  float gw = mk.g * (1. - smoothstep(.55, 1.05, gh)) * smoothstep(.006, .03, C);
  // 3. Sky area
  float sw = mk.b;

  float d  = clamp(dc * cw + gw * uGA + dot(ob, uOA) * cw, -1., 1.);
  float ds = clamp(sw * uSA, -1., 1.);
  float gt = gw * uGT, st = sw * uST;

  vec3 outc = src;
  if (abs(d) + abs(ds) + abs(gt) + abs(st) > .0005) {
    vec2 ab = lab.yz;
    float rot = gt * .3;                         // greenery tone: gentle hue turn, at most ~17°
    ab = vec2(ab.x * cos(rot) - ab.y * sin(rot), ab.x * sin(rot) + ab.y * cos(rot));
    ab += st * vec2(.005, .026) * smoothstep(.15, .5, lab.x); // sky tone acts like white balance

    float C0 = length(ab);
    vec2 dir = C0 > 1e-5 ? ab / C0 : vec2(0.);
    float dt = clamp(d + ds * smoothstep(.004, .03, C0), -1., 1.);
    float vib = 1. - .6 * smoothstep(.1, .28, C0); // vibrance: strong colours are boosted less
    float C2 = dt > 0. ? min(C0 * (1. + dt * .9 * vib), C0 + .06 * dt) : C0 * (1. + dt);

    // Small lightness shifts keep it photographic: richer colours sit a little deeper,
    // a stronger blue sky darkens like a polarising filter (the sun is left alone),
    // and lush greens are slightly deeper than golden ones.
    float bh = abs(h - 4.6); bh = min(bh, 6.2831853 - bh);
    float blueW = 1. - smoothstep(.6, 1.4, bh);
    float L2 = clamp(lab.x * (1. - .04 * d - .08 * ds * blueW - .04 * gt), 0., 1.);

    // Soft gamut roll-off: find the most colourful displayable value in this direction
    // and ease into it, so boosted colours never clip into flat, posterised patches.
    float lo = 0., hi = .45;
    for (int j = 0; j < 10; j++) {
      float mid = (lo + hi) * .5;
      if (outOfGamut(lab2lin(vec3(L2, dir * mid)))) hi = mid; else lo = mid;
    }
    float Cmax = max(lo * .9, min(C0, lo)), knee = .7 * Cmax;
    if (C2 > knee && Cmax > 1e-4) {
      float t = (C2 - knee) / max(Cmax - knee, 1e-4), e = exp(-2. * t);
      C2 = knee + (Cmax - knee) * (1. - e) / (1. + e);
    }
    C2 = min(C2, Cmax);
    if (dt > 0.) C2 = max(C2, min(C0, lo));       // a boost never makes a pixel duller
    outc = toSrgb(lab2lin(vec3(L2, dir * C2)));
  }

  outc = mix(outc, src, prot);                   // protected people stay original
  if (uOrig > .5 || (uSplit >= 0. && vUv.x < uSplit)) outc = src;

  if (uShowAreas > .5) {
    outc = mix(outc, vec3(.25, .62, .95), sw * .5);
    outc = mix(outc, vec3(.45, .85, .3), mk.g * .5);
    outc = mix(outc, vec3(1., .72, .25), max(max(ob.r, ob.g), max(ob.b, ob.a)) * .55);
  }
  outc = mix(outc, vec3(1., .72, .25), clamp(dot(ob, uHi), 0., 1.) * .45);
  if (uShowMask > .5) outc = mix(outc, vec3(.93, .35, .55), prot * .55);
  gl_FragColor = vec4(outc, 1.);
}`;
