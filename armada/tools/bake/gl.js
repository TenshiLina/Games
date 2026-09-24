// Asset baker harness: compiles an asset's shader, renders it into a float
// framebuffer, adds bloom from the emissive pass and returns a PNG data URL.
(function () {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL2 unavailable');
  gl.getExtension('EXT_color_buffer_float');

  const VS = `#version 300 es
  in vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const programs = new Map();
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const numbered = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
      throw new Error(log + '\n' + numbered.slice(0, 200000));
    }
    return s;
  }
  function program(asset) {
    if (programs.has(asset.name)) return programs.get(asset.name);
    const fs = asset.kind === 'image'
      ? GLSL_HEADER + asset.glsl + GLSL_IMAGE_MAIN
      : GLSL_HEADER + GLSL_RENDER + asset.glsl;
    const pr = gl.createProgram();
    gl.attachShader(pr, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(pr, 0, 'p');
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    programs.set(asset.name, pr);
    return pr;
  }

  // Render one pass in horizontal strips (keeps each draw call short so the
  // software GPU never hits a watchdog) and return premultiplied floats.
  function renderPass(asset, w, h, phase, pass) {
    const pr = program(asset);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.useProgram(pr);
    const u = (n) => gl.getUniformLocation(pr, n);
    gl.uniform2f(u('uRes'), w, h);
    gl.uniform1f(u('uPhase'), phase);
    gl.uniform1i(u('uPass'), pass);
    gl.uniform1f(u('uExtent'), asset.extent || 1);
    const cd = asset.camDir || [0, 0.34, -1];
    gl.uniform3f(u('uCamDir'), cd[0], cd[1], cd[2]);
    gl.uniform1i(u('uAA'), pass === 1 ? 2 : (asset.aa || 3));
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.SCISSOR_TEST);
    const strip = asset.strip || 64;
    const out = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y += strip) {
      const sh = Math.min(strip, h - y);
      gl.scissor(0, y, w, sh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const part = new Float32Array(w * sh * 4);
      gl.readPixels(0, y, w, sh, gl.RGBA, gl.FLOAT, part);
      out.set(part, y * w * 4);
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    return out;
  }

  function toCanvas(data, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = ((h - 1 - y) * w + x) * 4; // flip: GL origin is bottom-left
        const di = (y * w + x) * 4;
        const a = Math.min(1, data[si + 3]);
        const inv = a > 0 ? 1 / a : 0;
        img.data[di] = Math.min(255, data[si] * inv * 255 + 0.5);
        img.data[di + 1] = Math.min(255, data[si + 1] * inv * 255 + 0.5);
        img.data[di + 2] = Math.min(255, data[si + 2] * inv * 255 + 0.5);
        img.data[di + 3] = a * 255 + 0.5;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function bakeFrame(asset, phase) {
    const w = asset.size[0], h = asset.size[1];
    const beauty = toCanvas(renderPass(asset, w, h, phase, 0), w, h);
    if (!asset.bloom) return beauty;
    const emit = toCanvas(renderPass(asset, w, h, phase, 1), w, h);
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    ctx.drawImage(beauty, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (const [radius, alpha] of asset.bloom) {
      ctx.filter = `blur(${radius * w / 256}px)`;
      ctx.globalAlpha = alpha;
      ctx.drawImage(emit, 0, 0);
    }
    return out;
  }

  // Returns a data URL. Multi-frame assets are packed left to right,
  // wrapping after `cols` frames.
  window.bake = function (asset) {
    const frames = asset.frames || 1;
    const cols = asset.cols || frames;
    const rows = Math.ceil(frames / cols);
    const w = asset.size[0], h = asset.size[1];
    const sheet = document.createElement('canvas');
    sheet.width = w * cols; sheet.height = h * rows;
    const ctx = sheet.getContext('2d');
    for (let i = 0; i < frames; i++) {
      const phase = asset.phases ? asset.phases[i] : (frames > 1 ? i / (frames - (asset.loop ? 0 : 1)) : 0);
      ctx.drawImage(bakeFrame(asset, phase), (i % cols) * w, Math.floor(i / cols) * h);
    }
    return asset.format === 'jpg' ? sheet.toDataURL('image/jpeg', 0.92) : sheet.toDataURL('image/png');
  };
  window.ASSETS = window.ASSETS || [];
})();
