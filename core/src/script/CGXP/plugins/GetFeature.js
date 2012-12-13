/**
 * Copyright (c) 2011 Camptocamp
 *
 * CGXP is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * CGXP is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with CGXP.  If not, see <http://www.gnu.org/licenses/>.
 */

/*
 * @requires plugins/Tool.js
 * @include OpenLayers/Control/GetFeature.js
 * @include OpenLayers/Control/WMSGetFeatureInfo.js
 * @include OpenLayers/Protocol/WFS/v1_0_0.js
 * @include OpenLayers/Format/GML.js
 * @include OpenLayers/Format/WMSGetFeatureInfo.js
 * @include GeoExt/widgets/Action.js
 */


/** api: (define)
 *  module = cgxp.plugins
 *  class = GetFeature
 */

Ext.namespace("cgxp.plugins");

/** api: example
 *  Sample code showing how to add a GetFeature plugin to a
 *  `gxp.Viewer`:
 *
 *  .. code-block:: javascript
 *
 *      new gxp.Viewer({
 *          ...
 *          tools: [{
 *              ptype: "cgxp_getfeature",
 *              actionTarget: "center.tbar",
 *              toggleGroup: "maptools",
 *              events: EVENTS,
 *              themes: THEMES,
 *              mapserverURL: "${request.route_url('mapserverproxy', path='')}",
 *              WFSTypes: ${WFSTypes | n},
 *              externalWFSTypes: ${externalWFSTypes | n},
 *              enableWMTSLayers: true
 *          }]
 *          ...
 *      });
 *
 *  The min/maxResolutionHint can be computed with the following rule:
 *
 *  .. code-block:: javascript
 *
 *      1 / (1 / MIN/MAXSCALEDENOMINATOR * INCHES_PER_UNIT * DOTS_PER_INCH)
 *      1 / (1 / 25000 * 39.3701 * 96)
 *
 *  Or you can use min/maxScaleDenominator as set in MapServer.
 *
 */

/** api: constructor
 *  .. class:: GetFeature(config)
 *
 *  With this plugin we can query the map with a simple click
 *  (WMS GetFeatureInfo) or with a CTRL-Drag for a box query
 *  (WFS GetFeature).
 *  We can optionally (with actionTarget) add a toggle button
 *  to a toolbar to do a box query without the pressing the CTRL.
 *
 *  Only the currently visible layers are queried.
 *
 *  For a WMS layer the feature types sent in the WFS GetFeature query
 *  are obtained from its ``layers`` parameter.
 *
 *  For a layer of another type (layer that does not have a ``layers``
 *  parameter), the feature types are obtained from the layer's
 *  ``queryLayers`` option if it is defined, and from its
 *  ``mapserverLayers`` option if ``queryLayers`` is not defined.
 *
 *  Here's an example on how to use the ``queryLayers`` option
 *  in a layer config:
 *
 *  .. code-block:: javascript
 *
 *      ...
 *      queryLayers: [{
 *          name: "buildings",
 *          maxResolutionHint: 6.6145797614602611
 *      }, {
 *          name: "parcels",
 *          maxScaleDenominator: 10000
 *      }]
 *      ...
 *
 */
cgxp.plugins.GetFeature = Ext.extend(gxp.plugins.Tool, {

    /** api: ptype = cgxp_wfsgetfeature */
    ptype: "cgxp_getfeature",

    /** api: config[toggleGroup]
     *  ``String`` If this tool should be radio-button style toggled with other
     *  tools, this string is to identify the toggle group.
     */

    /** api: config[actionTarget]
     *  ``String`` or ``Null`` Where to place the optional tool's actions.
     */

    /** api: config[actionOptions]
     *  ``Object``
     *  Action options
     */
    actionOptions: {},

    /** api: config[events]
     *  ``Object``
     *  An Observer used to send events.
     */
    events: null,

    /** api: config[themes]
     *  ``Object`` List of internal and external themes and layers. (The
     *  same object as that passed to the :class:`cgxp.plugins.LayerTree`).
     */
    themes: null,

    /** api: config[geometryName]
     *  ``String``
     *  The geometry name.
     */
    geometryName: 'geom',

    /** api: config[enableWMTSLayers]
     *  ``Boolean``
     *  If true, WMTS layers will be queried as well.
     */
    enableWMTSLayers: false,

    /** api: config[WFSTypes]
     *  ``Array``
     *  The queryable type on the internal server.
     */

    /** api: config[externalWFSTypes]
     *  ``Array``
     *  The queryable type on the parent server.
     */

    /** api: config[mapserverURL]
     *  ``String``
     *  The mapserver proxy URL
     */

    /* i18n */
    tooltipText: 'Query the map',
    menuText: 'Query the map',
    noLayerSelectedMessage: 'No layer selected',
    unqueriedLayerTitle: 'Unable to query this layer',
    unqueriedLayerText: "This Layer don't support box query (WFS GetFeature).",
    wfsSuggestionShort: "Suggestion",
    wfsSuggestionLong: "To obtain information on an area, please perform a box query (WFS GetFeature) with ctrl-click-drag (or simply click-drag if the query tool is available in the toolbar.",

    /** api: method[addActions]
     */
    addActions: function() {
        this.buildControls();
        if (this.actionTarget) {
            var action = new GeoExt.Action(Ext.applyIf({
                allowDepress: true,
                enableToggle: true,
                iconCls: 'info',
                tooltip: this.tooltipText,
                menuText: this.menuText,
                toggleGroup: this.toggleGroup,
                control: this.toolWFSControl
            }, this.actionOptions));
            return cgxp.plugins.GetFeature.superclass.addActions.apply(this, [[action]]);
        }
    },

    /** private: method[buildControls]
     *  Create the WMS and WFS controls.
     */
    buildControls: function() {
        function browse(node, config) {
            config = config || {};
            for (var i = 0, leni = node.length; i < leni; i++) {
                var child = node[i];
                if (child.children) {
                    browse(child.children, config);
                } else {
                    config[child.name] = child;
                }
            }
            return config;
        };
        var themes = (this.themes.local || []).concat(
            this.themes.external || []);
        this.layersConfig = browse(themes)

        this.buildWMSControl();
        this.buildWFSControls();
    },

    /** private method[getQueryableWMSLayers]
     */
    getQueryableWMSLayers: function(layers) {
        var queryLayers = [];
        // Add only queryable layer or sublayer.
        Ext.each(layers, function(queryLayer) {
            if (queryLayer in this.layersConfig) {
                if (this.layersConfig[queryLayer].queryable) {
                    queryLayers.push(queryLayer);
                }
                Ext.each(this.layersConfig[queryLayer]
                        .childLayers, function(childLayer) {
                    if (childLayer.queryable) {
                        queryLayers.push(childLayer.name);
                    }
                });
            }
            else {
                queryLayers.push(queryLayer);
            }
        }, this);
        return queryLayers;
    },

    /** private method[createWMSControl]
     *  Create the WMS GetFeatureIndo control.
     */
    buildWMSControl: function() {
        var events = this.events;
        var self = this;

        // we overload findLayers to avoid sending requests
        // when we have no sub-layers selected
        this.clickWMSControl = new OpenLayers.Control.WMSGetFeatureInfo({
            infoFormat: "application/vnd.ogc.gml",
            maxFeatures: this.maxFeatures || 100,
            queryVisible: true,
            drillDown: true,
            autoActivate: true,

            findLayers: function() {
                // OpenLayers.Control.WMSGetFeatureInfo.prototype.findLayers
                // modified to get BaseLayers and add a message on
                // no layers selected
                var candidates = this.layers || this.map.layers;
                var layers = [];
                var layer, url;
                for (var i = candidates.length - 1; i >= 0; --i) {
                    layer = candidates[i];
                    if (!this.queryVisible || layer.getVisibility()) {
                        if (layer instanceof OpenLayers.Layer.WMS) {
                            url = OpenLayers.Util.isArray(layer.url) ? layer.url[0] : layer.url;
                            // if the control was not configured with a url, set it
                            // to the first layer url
                            if (this.drillDown === false && !this.url) {
                                this.url = url;
                            }
                            if (this.drillDown === true || this.urlMatches(url)) {
                                layers.push(layer);
                            }
                        }
                        else if (self.enableWMTSLayers &&
                                (layer instanceof OpenLayers.Layer.WMTS ||
                                typeof layer == 'OpenLayers.Layer.TMS')) {
                            layers.push(layer);
                        }
                    }
                }
                return layers;
            },

            request: function(clickPosition, options) {
                // OpenLayers.Control.WMSGetFeatureInfo.prototype.request
                // modified to support WMTS layers, external parameter,
                // add a message on no layers selected
                // and lunch querystarts event
                self.events.fireEvent('querystarts');
                var layers = this.findLayers();
                if (layers.length == 0) {
                    Ext.MessageBox.alert("Info", this.noLayerSelectedMessage);
                    this.events.triggerEvent("nogetfeatureinfo");
                    // Reset the cursor.
                    OpenLayers.Element.removeClass(this.map.viewPortDiv, "olCursorWait");
                    return;
                }

                options = options || {};
                this._requestCount = 0;
                this._numRequests = 0;
                this.features = [];
                // group according to service url to combine requests
                var externalServices = {}, internalServices = {}, url;
                for (var i=0, len=layers.length; i<len; i++) {
                    var layer = layers[i];
                    if (!(layer instanceof OpenLayers.Layer.WMS)) {
                        // Create a fake WMS layer
                        layer = {
                            url: self.mapserverURL,
                            projection:
                                self.target.mapPanel.map.getProjectionObject(),
                            reverseAxisOrder: function() { return false },
                            params: Ext.apply({
                                LAYERS: layer.queryLayers || layer.mapserverLayers,
                                VERSION: '1.1.1'
                            }, layer.mapserverParams)
                        }
                    }
                    var services = layer.params.EXTERNAL ?
                        externalServices : internalServices;
                    url = OpenLayers.Util.isArray(layer.url) ? layer.url[0] : layer.url;
                    if (url in services) {
                        services[url].push(layer);
                    } else {
                        this._numRequests++;
                        services[url] = [layer];
                    }
                }
                var layers;
                for (var url in services) {
                    layers = services[url];
                    var wmsOptions = this.buildWMSOptions(url, layers,
                        clickPosition, 'image/png');
                    OpenLayers.Request.GET(wmsOptions);
                }
            },

            eventListeners: {
                getfeatureinfo: function(e) {
                    this.events.fireEvent('queryresults', {
                        features: e.features,
                        warningMsg: [
                          '<abbr title="',
                          self.wfsSuggestionLong,
                          '">',
                          self.wfsSuggestionShort,
                          '</abbr>'
                          ].join('')
                    });
                },
                activate: function() {
                    this.events.fireEvent('queryopen');
                },
                deactivate: function() {
                    this.events.fireEvent('queryclose');
                },
                clickout: function() {
                    // the GetFeature control converts empty result to clickout.
                    this.events.fireEvent('queryresults', {
                        features: []
                    });
                },
                scope: this
            }
        });
        // solve problem with drag before click where event has a none-empty 
        // value for passesTolerance which bypass the click triggering
        this.clickWMSControl.handler.mouseup = function() {
            var result = OpenLayers.Handler.Click.prototype.mouseup
                    .apply(this, arguments);
            this.down = null;
            return result;
        }
        this.target.mapPanel.map.addControl(this.clickWMSControl);
    },

    /** private method[createWFSControls]
     *  Create the WFS GetFeature control.
     */
    buildWFSControls: function() {
        var protocol = new OpenLayers.Protocol.WFS({
            url: this.mapserverURL,
            geometryName: this.geometryName,
            srsName: this.target.mapPanel.map.getProjection(),
            formatOptions: {
                featureNS: 'http://mapserver.gis.umn.edu/mapserver',
                autoconfig: false
            }
        });
        var externalProtocol = new OpenLayers.Protocol.WFS({
            url: this.mapserverURL + "?EXTERNAL=true",
            geometryName: this.geometryName,
            srsName: this.target.mapPanel.map.getProjection(),
            formatOptions: {
                featureNS: 'http://mapserver.gis.umn.edu/mapserver',
                autoconfig: false
            }
        });

        var listners = {
            featuresselected: function(e) {
                this.events.fireEvent('queryresults', {
                    features: e.features
                });
            },
            activate: function() {
                this.events.fireEvent('queryopen');
            },
            deactivate: function() {
                this.events.fireEvent('queryclose');
            },
            clickout: function() {
                // the GetFeature control converts empty result to clickout.
                this.events.fireEvent('queryresults', {
                    features: []
                });
            },
            scope: this
        };
        var self = this;
        var request = function() {
            self.events.fireEvent('querystarts');
            var l = self.getLayers.call(self);
            if (l.internalLayers.length > 0) {
                protocol.format.featureType = l.internalLayers;
                this.protocol = protocol;
                OpenLayers.Control.GetFeature.prototype.request.apply(this, arguments);
            }
            if (l.externalLayers.length > 0) {
                externalProtocol.format.featureType = l.externalLayers;
                this.protocol = externalProtocol;
                OpenLayers.Control.GetFeature.prototype.request.apply(this, arguments);
            }
            if (l.unqueriedLayers.length > 0) {
                self.events.fireEvent('queryresults', {
                    features: [],
                    unqueriedLayers: l.unqueriedLayers
                });
            }
        };

        if (this.actionTarget) {
            // we overload findLayers to avoid sending requests
            // when we have no sub-layers selected
            this.toolWFSControl = new OpenLayers.Control.GetFeature({
                target: this.target,
                box: true,
                click: false,
                single: false,
                eventListeners: listners,
                request: request
            });
            // don't convert pixel to box, let the WFS GetFeature to query
            this.toolWFSControl.click = true;
            this.target.mapPanel.map.addControl(this.toolWFSControl);
        }
        this.ctrlWFSControl = new OpenLayers.Control.GetFeature({
            target: this.target,
            box: true,
            click: false,
            single: false,
            handlerOptions: {
                box: {
                    keyMask: OpenLayers.Handler.MOD_CTRL
                }
            },
            autoActivate: true,
            eventListeners: listners,
            request: request
        });
        this.target.mapPanel.map.addControl(this.ctrlWFSControl);
    },

    /** private: method[getLayers]
     *
     *  Gets the list of layers (internal and external) to build a request
     *  with.
     *  :returns: ``Object`` An object with `internalLayers` and `externalLayers`
     *  properties.
     */
    getLayers: function() {
        var map = this.target.mapPanel.map;
        var units = map.getUnits();
        function inRange(l, res) {
            if (!l.minResolutionHint && l.minScaleDenominator) {
                l.minResolutionHint =
                    OpenLayers.Util.getResolutionFromScale(l.minScaleDenominator, units);
            }
            if (!l.maxResolutionHint && l.maxScaleDenominator) {
                l.maxResolutionHint =
                    OpenLayers.Util.getResolutionFromScale(l.maxScaleDenominator, units);
            }
            return (!((l.minResolutionHint && res < l.minResolutionHint) ||
                (l.maxResolutionHint && res > l.maxResolutionHint)));
        }

        var olLayers = map.getLayersByClass("OpenLayers.Layer.WMS");
        if (this.enableWMTSLayers) {
            olLayers = olLayers.concat(
                map.getLayersByClass("OpenLayers.Layer.WMTS")
            );
            olLayers = olLayers.concat(
                map.getLayersByClass("OpenLayers.Layer.TMS")
            );
        }
        var internalLayers = [];
        var externalLayers = [];
        var unqueriedLayers = [];

        var currentRes = map.getResolution();
        Ext.each(olLayers, function(olLayer) {
            if (olLayer.getVisibility() === true) {
                var layers = olLayer.params.LAYERS ||
                             olLayer.queryLayers ||
                             olLayer.mapserverLayers;
                if (!layers) {
                    return;
                }

                if (!Ext.isArray(layers)) {
                    layers = layers.split(',');
                }
                layers = this.getQueryableWMSLayers(layers);

                var filteredLayers = [];
                Ext.each(layers, function(layer) {
                    l = this.layersConfig[layer];
                    if (l) {
                        if (l.childLayers && l.childLayers.length > 0) {
                            // layer is a layergroup (as per Mapserver)
                            Ext.each(l.childLayers, function(child) {
                                if (inRange(child, currentRes)) {
                                    filteredLayers.push(c.name);
                                }
                            }, this);
                        } else {
                            // layer is not a layergroup
                            if (inRange(l, currentRes)) {
                                filteredLayers.push(layer);
                            }
                        }
                    } else if (inRange(layer, currentRes)) {
                        filteredLayers.push(layer.name || layer);
                    }
                }, this);

                Ext.each(filteredLayers, function(layer) {
                    var queryed = false;
                    if (olLayer.mapserverParams &&
                            olLayer.mapserverParams.EXTERNAL ||
                            olLayer.params && olLayer.params.EXTERNAL) {
                        if (this.externalWFSTypes.indexOf(layer) >= 0) {
                            externalLayers.push(layer);
                            queryed = true;
                        }
                    }
                    else {
                        if (this.WFSTypes.indexOf(layer) >= 0) {
                            internalLayers.push(layer);
                            queryed = true;
                        }
                    }
                    if (!queryed) {
                        unqueriedLayers.push({
                            unqueriedLayerId: layer,
                            unqueriedLayerTitle: this.unqueriedLayerTitle,
                            unqueriedLayerText: this.unqueriedLayerText
                        });
                    }
                }, this);
            }
        }, this);

        return {
            internalLayers: internalLayers,
            externalLayers: externalLayers,
            unqueriedLayers: unqueriedLayers
        };
    }
});

Ext.preg(cgxp.plugins.GetFeature.prototype.ptype, cgxp.plugins.GetFeature);
