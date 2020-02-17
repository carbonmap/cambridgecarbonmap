/*
 * carbon-map
 * 
 * Copyright 2020 Chris Pointon
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

/*
 * Custom user interface elements for pure knob.
 */
class CarbonMap {
    constructor() {
        this.dataRoot = 'https://data.cambridgecarbonmap.org';
        this.initialLatLon = [52.205, 0.1218];
        this.initialZoom = 12.5;
        this.mapDiv = 'mainMap';
    }

    initialize() {
        if(typeof(L) == 'undefined') {
            console.log('Please include Leaflet before initializing CarbonMap');
            return;
        }
        this.mainMap = L.map(this.mapDiv).setView(this.initialLatLon, this.initialZoom);
        const attribution = '&copy; <a href="https://www.openstreetmap/copyright">OpenStreeMap</a> contributors';
        const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        const tiles = L.tileLayer(tileUrl, {attribution});
        tiles.addTo(this.mainMap);

        var that = this;

        this.lock = false;
        this.mainMap.on('click', function(e) {        
                that.lock = !that.lock       
            });
        $.getJSON(this.dataRoot+"/reporting_entities/", function(data) {
            var xhr = [];
            var xhr2 = [];
            var first_dict = {};
            data.forEach(function(entity, index) {
                $.getJSON(that.dataRoot+"/reporting_entities/"+entity+".json", function(reportingEntity) {
                    if('geojson' in reportingEntity) {
                        $.getJSON(that.dataRoot+reportingEntity.geojson, function (geojson) {
                            L.geoJSON(geojson,
                            {
                                onEachFeature: function(feature, layer) {
                                    first_dict[feature.properties.id] = false;

                                    var popup = new L.Popup({
                                        autoPan: false,
                                        keepInView: true,
                                    }).setContent(reportingEntity.name);
                                    layer.bindPopup(popup, {maxWidth: 800});

                                    that.mainMap.closePopup();

                                    layer.on('click', function (e) {
                                        
                                        if(first_dict[feature.properties.id] == false){
                                            first_dict[feature.properties.id] = that.createPopupDashboard(feature, reportingEntity);
                                        }

                                        that.lock = !that.lock;
                                        if (that.lock){
                                            that.mainMap.closePopup();
                                            popup.setContent(first_dict[feature.properties.id]);
                                            popup.setLatLng(e.latlng).openOn(that.mainMap);
                                        }
                                        else{
                                            popup.setContent(reportingEntity.name);
                                        }
                                    });

                                    layer.on('mouseover', function (e) {
                                        this.setStyle({ 'fillColor': '#ff0000'});
                                        if (!that.lock){
                                            popup.setLatLng(e.latlng).openOn(that.mainMap);
                                            popup.setContent(reportingEntity.name);
                                        };
                                    });

                                    layer.on('mouseout', function (e) {
                                        this.setStyle({'fillColor': '#0000ff'});
                                        if(!that.lock){
                                            that.mainMap.closePopup();
                                        }
                                    });

                                    layer.on('mousemove', function (e) {
                                        if(!that.lock){
                                            that.mainMap.closePopup();
                                            popup.setLatLng(e.latlng).openOn(that.mainMap);
                                        }
                                    });

                                    popup.setLatLng([0,0]).openOn(that.mainMap);
                                    that.mainMap.closePopup();
                                }
                            }).addTo(that.mainMap);
                        });
                    }
                });
            });
        });
    }

    createPopupDashboard(feature, reportingEntity){
        var div = document.createElement("div");
        div.id = `${feature.properties.id}`;
        
        document.getElementsByTagName('body')[0].appendChild(div);

        //console.log(document.getElementById(feature.properties.id));

        this.createDashboard(reportingEntity, div);
        return div;
    }

    createDashboard(entity, container) {
        const max_value_gas = 10;
        const max_value_elec = 10;

        var gasKnob = pureknob.createKnob(200, 150);
        gasKnob.setProperty("angleStart", -Math.PI/2 - 0.35);
        gasKnob.setProperty("angleEnd", Math.PI/2 + 0.35);
        gasKnob.setProperty("valMin", 0);
        gasKnob.setProperty("valMax", max_value_gas);
        gasKnob.setProperty("colorBG", "Grey");
        gasKnob.setProperty("label", entity.name+" Gas Usage")
        gasKnob.setProperty("colorLabel", "Orange");
        gasKnob.setProperty("colorFG", "Orange");
        gasKnob.setProperty("trackWidth", 0.25);
        gasKnob.setProperty("textScale", 1);
        gasKnob.setProperty("readonly", true);
        
        gasKnob.setValue(entity.emissions[0].value);
        var gasNode = gasKnob.node();

        var elecKnob = pureknob.createKnob(200, 150);
        elecKnob.setProperty("angleStart", -Math.PI/2 - 0.35);
        elecKnob.setProperty("angleEnd", Math.PI/2 + 0.35);
        elecKnob.setProperty("valMin", 0);
        elecKnob.setProperty("valMax", max_value_elec);
        elecKnob.setProperty("colorBG", "Grey");
        elecKnob.setProperty("label", entity.name+" Electricity Usage")
        elecKnob.setProperty("colorLabel", "Blue");
        elecKnob.setProperty("colorFG", "Blue");
        elecKnob.setProperty("trackWidth", 0.25);
        elecKnob.setProperty("textScale", 1);
        gasKnob.setProperty("readonly", true);
        
        elecKnob.setValue(entity.emissions[1].value);
        var elecNode = elecKnob.node();

        var elem = container;
        elem.appendChild(gasNode);
        elem.appendChild(elecNode);
    }
};