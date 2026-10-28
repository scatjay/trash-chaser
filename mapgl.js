/* mapgl.js —— 用 MapLibre GL 實作「垃圾追追追」用到的那一小部分 Leaflet 介面（L.map / marker / polyline / layerGroup / circleMarker / 控制鈕），
   讓主程式不必改寫就能換成支援「傾斜（透視）視角」的地圖引擎；MapLibre 是 BSD 授權，也順便擺脫 leaflet-rotate 的 GPL。
   換算：Leaflet 的縮放級數 = MapLibre 縮放 + 1（256px 圖磚）；leaflet-rotate 的 bearing = (360 − MapLibre bearing) % 360。
   只實作 app 實際用到的方法；沒用到的不做。 */
(function () {
  'use strict';
  const ML = window.maplibregl;
  const norm = a => (a % 360 + 360) % 360;
  const ll = a => (Array.isArray(a) ? { lat: a[0], lng: a[1] } : { lat: a.lat, lng: a.lng !== undefined ? a.lng : a.lon });

  const DomUtil = { create(tag, cls, parent) { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; } };
  const DomEvent = {
    on(el, ev, fn) { el.addEventListener(ev, fn); return DomEvent; },
    preventDefault(e) { e.preventDefault(); },
    disableClickPropagation(el) { ['click', 'dblclick', 'mousedown', 'touchstart', 'pointerdown', 'wheel'].forEach(t => el.addEventListener(t, e => e.stopPropagation())); },
  };

  // ---- 控制鈕（沿用 Leaflet 的 DOM 結構與 CSS class，樣式不用另寫）----
  function Control() {}
  Control.extend = function (proto) {
    const C = function () {};
    C.prototype = Object.assign(Object.create(Control.prototype), proto);
    return C;
  };
  Control.prototype.addTo = function (map) {
    const pos = (this.options && this.options.position) || 'bottomright';
    const el = this.onAdd(map);
    el.classList.add('leaflet-control');
    map._corner(pos).appendChild(el);
    return this;
  };
  function zoomControl(opts) {
    return {
      addTo(map) {
        const d = DomUtil.create('div', 'leaflet-bar leaflet-control');
        const mk = (txt, cls, fn, label) => { const a = DomUtil.create('a', cls, d); a.href = '#'; a.textContent = txt; a.setAttribute('role', 'button'); a.setAttribute('aria-label', label); a.addEventListener('click', e => { e.preventDefault(); fn(); }); };
        mk('+', 'leaflet-control-zoom-in', () => map._ml.zoomIn({ duration: 200 }), '放大');
        mk('−', 'leaflet-control-zoom-out', () => map._ml.zoomOut({ duration: 200 }), '縮小');
        DomEvent.disableClickPropagation(d);
        map._corner((opts && opts.position) || 'bottomright').appendChild(d);
        return this;
      },
    };
  }

  // ---- 圖層基底：addTo(map|group)、_remove ----
  class Layer {
    addTo(target) {
      if (target && target._isGroup) { target._children.add(this); this._map = target._map; this._attach(target._map); }
      else { this._map = target; this._attach(target); }
      return this;
    }
  }
  let uid = 0;

  class Marker extends Layer {
    constructor(latlng, opts) { super(); this._ll = ll(latlng); this._icon = (opts && opts.icon) || {}; this._z = (opts && opts.zIndexOffset) || 0; }
    _apply() {
      const ic = this._icon, el = this._el, sz = ic.iconSize || [0, 0], an = ic.iconAnchor || [sz[0] / 2, sz[1]];
      el.innerHTML = ic.html || '';
      el.style.width = sz[0] + 'px'; el.style.height = sz[1] + 'px';
      el.style.zIndex = this._z ? String(this._z) : '';
      if (this._m) this._m.setOffset([-an[0], -an[1]]);
      this._anchor = an;
    }
    _attach(map) {
      this._el = document.createElement('div'); this._el.className = 'gl-marker ' + (this._icon.className || '');
      this._apply();
      this._m = new ML.Marker({ element: this._el, anchor: 'top-left', offset: [-this._anchor[0], -this._anchor[1]], pitchAlignment: 'viewport', rotationAlignment: 'viewport' })
        .setLngLat([this._ll.lng, this._ll.lat]).addTo(map._ml);
    }
    setLatLng(p) { this._ll = ll(p); if (this._m) this._m.setLngLat([this._ll.lng, this._ll.lat]); return this; }
    getLatLng() { return { lat: this._ll.lat, lng: this._ll.lng }; }
    setIcon(ic) { this._icon = ic; if (this._el) this._apply(); return this; }
    _remove() { if (this._m) { this._m.remove(); this._m = null; } }
  }

  class CircleMarker extends Layer {
    constructor(latlng, o) { super(); this._ll = ll(latlng); this._o = o || {}; }
    bindTooltip(text) { this._tip = text; return this; }
    _attach(map) {
      const o = this._o, r = o.radius || 4, w = o.weight == null ? 1 : o.weight, d = 2 * r + 2 * w;
      const el = document.createElement('div');
      el.style.cssText = `width:${d}px;height:${d}px;border-radius:50%;box-sizing:border-box;border:${w}px solid ${o.color || '#fff'};position:relative;cursor:pointer`;
      const f = document.createElement('div');
      f.style.cssText = `position:absolute;inset:0;border-radius:50%;background:${o.fillColor || '#3388ff'};opacity:${o.fillOpacity == null ? 0.2 : o.fillOpacity}`;
      el.appendChild(f);
      if (this._tip) { el.title = this._tip; el.addEventListener('click', e => { e.stopPropagation(); if (this._pop) { this._pop.remove(); this._pop = null; } else { this._pop = new ML.Popup({ closeButton: false, offset: 10 }).setLngLat([this._ll.lng, this._ll.lat]).setText(this._tip).addTo(map._ml); } }); }
      this._m = new ML.Marker({ element: el, pitchAlignment: 'viewport', rotationAlignment: 'viewport' }).setLngLat([this._ll.lng, this._ll.lat]).addTo(map._ml);
    }
    _remove() { if (this._pop) this._pop.remove(); if (this._m) this._m.remove(); this._m = null; }
  }

  class Polyline extends Layer {
    constructor(pts, o) { super(); this._pts = pts.map(ll); this._o = o || {}; this._id = 'pl' + (++uid); }
    _attach(map) {
      const id = this._id, o = this._o, ml = map._ml;
      const add = () => {
        if (!this._map || ml.getSource(id)) return;
        ml.addSource(id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: this._pts.map(p => [p.lng, p.lat]) } } });
        ml.addLayer({ id, type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': o.color || '#3388ff', 'line-width': o.weight || 3, 'line-opacity': o.opacity == null ? 1 : o.opacity } });
      };
      map._ready(add);
    }
    _remove() { const ml = this._map && this._map._ml; this._map = null; if (!ml) return; try { if (ml.getLayer(this._id)) ml.removeLayer(this._id); if (ml.getSource(this._id)) ml.removeSource(this._id); } catch (e) {} }
  }

  class LayerGroup {
    constructor() { this._isGroup = true; this._children = new Set(); this._map = null; }
    addTo(map) { this._map = map; return this; }
    clearLayers() { for (const c of this._children) c._remove(); this._children.clear(); return this; }
    _remove() { this.clearLayers(); }
  }

  class Bounds { constructor(pts) { this.pts = pts.map(ll); } }

  // ---- 地圖 ----
  class GLMap {
    constructor(id, opts) {
      opts = opts || {};
      this._maxZ = opts.maxZoom || 19;
      this._el = typeof id === 'string' ? document.getElementById(id) : id;
      this._el.classList.add('leaflet-container', 'leaflet-touch');
      this._corners = {};
      this._pitchDeg = 0;
      this._listeners = {};
      this._ml = new ML.Map({
        container: this._el,
        style: { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap' } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] },
        center: [120.21, 22.99], zoom: 11, maxZoom: this._maxZ - 1, maxPitch: 75, pitch: 0, bearing: 0,
        attributionControl: false, dragRotate: false, touchPitch: false, pitchWithRotate: false,
      });
      this._ml.touchZoomRotate.disableRotation();
      this._ml.addControl(new ML.AttributionControl({ compact: true }), 'bottom-left');
      this._loaded = false; this._q = [];
      this._ml.on('load', () => { this._loaded = true; this._q.splice(0).forEach(f => f()); });
      this._ml.on('resize', () => this._applyPad());   // 選單收合／展開讓地圖高度變了：留白要跟著重算，否則「我」會跑到畫面邊緣
    }
    _applyPad() { const h = this._el.clientHeight; this._ml.setPadding({ top: this._pitchDeg > 0 ? Math.round(h * 0.42) : 0, bottom: 0, left: 0, right: 0 }); }
    _ready(fn) { if (this._loaded) fn(); else this._q.push(fn); }
    _corner(pos) {
      if (!this._corners[pos]) {
        const v = pos.startsWith('top') ? 'top' : 'bottom', h = pos.endsWith('left') ? 'left' : 'right';
        const c = DomUtil.create('div', `leaflet-${v} leaflet-${h}`, this._el); this._corners[pos] = c;
      }
      return this._corners[pos];
    }
    setView(c, z) { const p = ll(c); this._ml.jumpTo({ center: [p.lng, p.lat], ...(z != null ? { zoom: z - 1 } : {}) }); return this; }
    getZoom() { return this._ml.getZoom() + 1; }
    setZoom(z) { this._ml.jumpTo({ zoom: z - 1 }); return this; }
    getCenter() { const c = this._ml.getCenter(); return { lat: c.lat, lng: c.lng }; }
    panTo(c, o) { const p = ll(c); this._ml.easeTo({ center: [p.lng, p.lat], duration: o && o.animate === false ? 0 : 250 }); return this; }
    fitBounds(b, o) {
      o = o || {}; const lats = b.pts.map(p => p.lat), lngs = b.pts.map(p => p.lng), pad = Array.isArray(o.padding) ? o.padding[0] : (o.padding || 0);
      this._ml.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: pad, ...(o.maxZoom != null ? { maxZoom: o.maxZoom - 1 } : {}), duration: o.animate === false ? 0 : 400 });
      return this;
    }
    invalidateSize() { this._ml.resize(); return this; }
    setBearing(b) { this._ml.setBearing(norm(360 - b)); return this; }       // 墊片 bearing = leaflet-rotate 語意（地圖旋轉量）
    getBearing() { return norm(360 - this._ml.getBearing()); }
    setPitch(deg) {                                                            // 傾斜：0=平面。傾斜時把「我」往畫面下方放（像 Google 地圖導航，前方看得比較遠）
      this._pitchDeg = deg;
      this._applyPad();
      this._ml.easeTo({ pitch: deg, duration: 500 }); return this;
    }
    getPitch() { return this._pitchDeg; }
    latLngToContainerPoint(p) { const q = ll(p), pt = this._ml.project([q.lng, q.lat]); return { x: pt.x, y: pt.y }; }
    removeLayer(l) { if (l && l._remove) l._remove(); return this; }
    on(ev, fn) {
      if (ev === 'click') this._ml.on('click', e => fn({ latlng: { lat: e.lngLat.lat, lng: e.lngLat.lng } }));
      else if (ev === 'dragstart') this._ml.on('dragstart', () => fn());
      else this._ml.on(ev, fn);
      return this;
    }
  }

  window.L = {
    map: (id, o) => new GLMap(id, o),
    tileLayer: () => ({ addTo() { return this; } }),     // 圖磚來源已寫在 style 裡
    control: { zoom: zoomControl },
    Control, DomUtil, DomEvent,
    marker: (p, o) => new Marker(p, o),
    divIcon: o => o,
    circleMarker: (p, o) => new CircleMarker(p, o),
    polyline: (pts, o) => new Polyline(pts, o),
    layerGroup: () => new LayerGroup(),
    latLngBounds: pts => new Bounds(pts),
  };
  window.GL_ENGINE = true;
})();
