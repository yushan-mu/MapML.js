import './leaflet-src.js';  // a lightly modified version of Leaflet for use as browser module
import './proj4-src.js';        // modified version of proj4; could be stripped down for mapml
import './proj4leaflet.js'; // not modified, seems to adapt proj4 for leaflet use. 
import './mapml.js';       // modified URI to make the function a property of window scope (possibly a bad thing to do).

export class MapLayer extends HTMLElement {
  static get observedAttributes() {
    return ['src', 'label', 'checked', 'disabled', 'hidden'];
  }
  get src() {
    return this.hasAttribute('src')?this.getAttribute('src'):'';
  }

  set src(val) {
    if (val) {
      this.setAttribute('src', val);
      if (this._layer) {
        // go through the same sequence as if the layer had been removed from
        // the DOM and re-attached with a new URL source.
        this.disconnectedCallback();
        var base = this.baseURI ? this.baseURI : document.baseURI;
        this._layer = M.mapMLLayer(val ? (new URL(val, base)).href: null, this);
        this._layer.on('extentload', this._onLayerExtentLoad, this);
        this._setUpEvents();
        if (this.parentNode) {
          this.connectedCallback();
        }
      }
    }
  }
  get label() {
    return this.hasAttribute('label')?this.getAttribute('label'):'';
  }
  set label(val) {
    if (val) {
      this.setAttribute('label',val);
    }
  }
  get checked() {
    return this.hasAttribute('checked');
  }
  
  set checked(val) {
    if (val) {
      this.setAttribute('checked', '');
    } else {
      this.removeAttribute('checked');
    }
  }
  
  get hidden() {
    return this.hasAttribute('hidden');
  }

  set hidden(val) {
    if (val) {
      this.setAttribute('hidden', '');
    } else {
      this.removeAttribute('hidden');
    }
    var map = this.parentElement && this.parentElement._map;
    if (map && this.parentElement.controls) {
        if (val) {
            this.parentElement._layerControl.removeLayer(this._layer);
        } else {
            this._layerControl = this.parentElement._layerControl;
            this._layerControl.addOrUpdateOverlay(this._layer,this.label);
        }
        this._validateDisabled();
    }
  }
  constructor() {
    // Always call super first in constructor
    super();
  }
  disconnectedCallback() {
//    console.log('Custom map element removed from page.');
    // if the map-layer node is removed from the dom, the layer should be
    // removed from the map and the layer control 

    // this is moved up here so that the layer control doesn't respond
    // to the layer being removed with the _onLayerChange execution
    // that is set up in _attached:
    this._removeEvents();
    if (this._layer._map) {
      this._layer._map.removeLayer(this._layer);
    }

    if (this._layerControl && !this.hidden) {
      this._layerControl.removeLayer(this._layer);
    }
  }
  connectedCallback() {
    // this avoids displaying inline mapml content, such as features and inputs
    // but does not avoid FOUC. 
    // To avoid FOUC, use <layer- style="display: none"...>...</layer->
    this.style = "display: none";
    this._ready();
    // if the map has been attached, set this layer up wrt Leaflet map
    if (this.parentNode._map) {
        this._attachedToMap();
    }
    if (this._layerControl && !this.hidden) {
      this._layerControl.addOrUpdateOverlay(this._layer, this.label);
    }
  }
  adoptedCallback() {
//    console.log('Custom map element moved to new page.');
  }
  attributeChangedCallback(name, oldValue, newValue) {
    switch(name) {
      case 'label': {
          if (oldValue !== newValue) {
            this.dispatchEvent(new CustomEvent('labelchanged', {detail: 
              {target: this}}));
          }
      }
    }
  }
  _onLayerExtentLoad(e) {
    // the mapml document associated to this layer can in theory contain many
    // link[@rel=legend] elements with different @type or other attributes;
    // currently only support a single link, don't care about type, lang etc.
    // TODO: add support for full LayerLegend object, and > one link.
    if (this._layer._legendUrl) {
      this.legendLinks = 
        [{ type: 'application/octet-stream',
           href: this._layer._legendUrl,
           rel: 'legend',
           lang: null,
           hreflang: null,
           sizes: null }];
    }
    if (this._layer._title) {
      this.label = this._layer._title;
    }
    // make sure local content layer has the chance to set its extent properly
    // which is important for the layer control and the disabled property
    if (this._layer._map) {
      this._layer.fire('attached', this._layer);
    }
    // TODO ensure the controls in this._layerControl contain 'live' controls
    // which control the layer, not potentially the previous style / src
    if (this._layerControl) {
      this._layerControl.addOrUpdateOverlay(this._layer, this.label);
    }
    if (!this._layer.error) {
      // re-use 'loadedmetadata' event from HTMLMediaElement inteface, applied
      // to MapML extent as metadata
      // https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/loadedmetadata_event
      this.dispatchEvent(new CustomEvent('loadedmetadata', {detail: 
                {target: this}}));
    } else {
      this.dispatchEvent(new CustomEvent('error', {detail: 
                {target: this}}));
    }
  }
  _validateDisabled() {
    var layer = this._layer, map = layer._map;
    if (map) {
      var zoomBounds = layer.getZoomBounds(), zoom = map.getZoom(), 
      withinZoomBounds = (zoomBounds && zoomBounds.min <= zoom && zoom <= zoomBounds.max),
      projectionMatches = layer._projectionMatches(map),
      visible = projectionMatches && withinZoomBounds;// && map.getPixelBounds().intersects(layer.getLayerExtentBounds(map));
      this.disabled = !visible;
    }
  }
  _onLayerChange() {
    if (this._layer._map) {
     // can't disable observers, have to set a flag telling it where
     // the 'event' comes from: either the api or a user click/tap
     // may not be necessary -> this._apiToggleChecked = false;
     this.checked = this._layer._map.hasLayer(this._layer);
    }
  }
  _toggleHidden(hide) {
    var map = this.parentElement && this.parentElement._map;
    if (map && this.parentElement.controls) {
      if (hide) {
        this.parentElement._layerControl.removeLayer(this._layer);
      } else {
        this._layerControl = this.parentElement._layerControl;
        this._layerControl.addOrUpdateOverlay(this._layer,this.label);
      }
      this._validateDisabled();
    }
  }
  _ready() {
    // the layer might not be attached to a map
    // so we need a way for non-src based layers to establish what their
    // zoom range, extent and projection are.  meta elements in content to
    // allow the author to provide this explicitly are one way, they will
    // be parsed from the second parameter here
    // IE 11 did not have a value for this.baseURI for some reason
    var base = this.baseURI ? this.baseURI : document.baseURI;
    this._layer = M.mapMLLayer(this.src ? (new URL(this.src, base)).href: null, this);
    this._layer.on('extentload', this._onLayerExtentLoad, this);
    this._setUpEvents();
  }
  _attachedToMap() {
    // set i to the position of this layer element in the set of layers
    var i = 0, position = 1;
    for (var nodes = this.parentNode.children;i < nodes.length;i++) {
      if (this.parentNode.children[i].nodeName === "LAYER-") {
        if (this.parentNode.children[i] === this) {
          break;
        }
        position++;
      }
    }
    var proj = this.parentNode.projection ? this.parentNode.projection : "OSMTILE";
    L.setOptions(this._layer, {zIndex: position, mapprojection: proj, opacity: window.getComputedStyle(this).opacity});
    // make sure the Leaflet layer has a reference to the map
    this._layer._map = this.parentNode._map;
    // notify the layer that it is attached to a map (layer._map)
    this._layer.fire('attached');

    if (this.checked) {
      this._layer.addTo(this._layer._map);
    }
    
    // Convention / limitation of this polyfill: styles that you want 
    // to apply to a <layer-> child need to be a <style> element child of 
    // the <layer->, because this polyfill is not native, just a showcase
    // of what could be.  COULD BE IMPROVED.
    // move any layer- child style elements into the shadow root of the map,
    // so that styles specified for the layer will apply to how those things
    // are implemented, currently by a Leaflet map div.
    var inline_styles = this.querySelectorAll('style,link[rel=stylesheet]');
    for(var i=0;i< inline_styles.length;i++) {
      this.parentNode._container.insertAdjacentElement('beforebegin',inline_styles[i]);
    }
    
    // add the handler which toggles the 'checked' property based on the
    // user checking/unchecking the layer from the layer control
    // this must be done *after* the layer is actually added to the map
    this._layer.on('add remove', this._onLayerChange,  this);

    // if controls option is enabled, insert the layer into the overlays array
    if (this.parentNode.controls && !this.hidden) {
      this._layerControl = this.parentNode._layerControl;
      this._layerControl.addOrUpdateOverlay(this._layer, this.label);
    }
    // toggle the this.disabled attribute depending on whether the layer
    // is: same prj as map, within view/zoom of map
    this._layer._map.on('moveend', this._validateDisabled,  this);
    // this is necessary to get the layer control to compare the layer
    // extents with the map extent & zoom, but it needs to be rethought TODO
    // for one thing, layers which are checked by the author before 
    // adding to the map are displayed despite that they are not visible
    // See issue #26
//        this._layer._map.fire('moveend');
  }
  _removeEvents() {
    if (this._layer) {
      this._layer.off('loadstart', false, this);
      this._layer.off('changestyle', false, this);
      this._layer.off('add remove', this._onLayerChange,  this);
    }
  }
  _setUpEvents() {
    this._layer.on('loadstart', 
        function () {
            this.dispatchEvent(new CustomEvent('loadstart', {detail: 
              {target: this}}));
        }, this);      
    this._layer.on('changestyle',
        function(e) {
          this.src = e.src;
          this.dispatchEvent(new CustomEvent('changestyle', {detail: 
              {target: this}}));
        },this);
    this._layer.on('changeprojection',
        function(e) {
          this.src = e.href;
          this.dispatchEvent(new CustomEvent('changeprojection', {detail: 
              {target: this}}));
        },this);
  }
}
