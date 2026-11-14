/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { Coordinates } from "../core/Coordinates.js";
import { CuzkTerrain } from "./CuzkTerrain.js";

import type { IMapErrorHandler, IMapLoadingChangedHandler } from "./MapCallbacks.js";
import type * as Cesium from "cesium";
import type { Cartesian3, CesiumWidget, ImageryLayer, PerspectiveFrustum } from "cesium";
import type { ITerrainOptions } from "./ITerrainOptions.js";
import type { ICameraState } from "../core/ICameraState.js";
import type { IVector3 } from "../core/LocalOrigin.js";

export enum MapSource {
    OSM = "osm",
    TOPOGRAPHIC = "topographic",
    ORTHOPHOTO = "orthophoto",
    CADASTRE = "cadastre"
}

export type { IMapErrorHandler, IMapLoadingChangedHandler } from "./MapCallbacks.js";

export interface IMapOptions {
    readonly container : HTMLElement;
    readonly assetsUrl : string;
    readonly creditContainer? : HTMLElement;
    readonly sourceCrs? : string;
    readonly terrain? : boolean;
    readonly terrainOptions? : ITerrainOptions;
    readonly background? : string;
    // Maximum map rendering distance in metres; defaults to 100 km.
    readonly viewDistance? : number;
    readonly OnError? : IMapErrorHandler;
    readonly OnLoadingChanged? : IMapLoadingChangedHandler;
}

export class MapView {
    private static readonly OSM_URL : string = "https://tile.openstreetmap.org/";
    private static readonly CADASTRE_URL : string = "https://services.cuzk.gov.cz/wms/local-km-wms.asp";
    private static readonly MAP_SERVICE_URL : string = "https://ags.cuzk.gov.cz/arcgis1/rest/services/";
    private static readonly COVERAGE_WEST : number = 11.8;
    private static readonly COVERAGE_SOUTH : number = 48.4;
    private static readonly COVERAGE_EAST : number = 19;
    private static readonly COVERAGE_NORTH : number = 51.2;
    private static readonly MAX_IMAGERY_LEVEL : number = 19;
    private static readonly DEFAULT_VIEW_DISTANCE : number = 100000;
    private static readonly DEFAULT_SAMPLE_LEVEL : number = 14;
    private static readonly DEFAULT_BACKGROUND : string = "#202124";
    private static readonly MIN_CLIP_DEPTH : number = 1;
    private static assetsUrl? : string;
    private readonly widget : CesiumWidget;
    private readonly cesium : typeof Cesium;
    private readonly coordinates : Coordinates;
    private readonly terrain? : CuzkTerrain;
    private disposed : boolean = false;
    private readonly viewDistance : number;

    public static async Create(options : IMapOptions) : Promise<MapView> {
        const assetsUrl : string = new URL(options.assetsUrl, document.baseURI).href;
        if (MapView.assetsUrl !== undefined && MapView.assetsUrl !== assetsUrl) {
            throw new Error("All map instances must use the same Cesium asset directory.");
        }
        MapView.assetsUrl = assetsUrl;
        Object.assign(globalThis, {CESIUM_BASE_URL: assetsUrl});
        const cesium = await import("cesium");
        return new MapView(options, cesium);
    }

    private constructor(options : IMapOptions, cesium : typeof Cesium) {
        this.cesium = cesium;
        this.viewDistance = options.viewDistance ?? MapView.DEFAULT_VIEW_DISTANCE;
        if (!Number.isFinite(this.viewDistance) || this.viewDistance <= 0) {
            throw new RangeError("Map view distance must be positive and finite.");
        }
        this.coordinates = new Coordinates(options.sourceCrs);
        if (options.terrain !== false) {
            this.terrain = new CuzkTerrain(cesium, options.OnError ?? (() => undefined), () => {
                this.widget.scene.requestRender();
            }, options.terrainOptions);
        }
        this.widget = new this.cesium.CesiumWidget(options.container, {
            baseLayer: false,
            ...(options.creditContainer === undefined ? {} : {creditContainer: options.creditContainer}),
            terrainProvider: this.terrain?.provider ?? new this.cesium.EllipsoidTerrainProvider(),
            requestRenderMode: true,
            maximumRenderTimeChange: Infinity,
            skyBox: false,
            skyAtmosphere: false
        });
        this.widget.scene.globe.showGroundAtmosphere = false;
        this.widget.scene.globe.showWaterEffect = false;
        // The map is a two-sided reference surface, not an opaque planet interior.
        this.widget.scene.globe.backFaceCulling = false;
        this.widget.scene.globe.showSkirts = false;
        this.widget.scene.globe.depthTestAgainstTerrain = true;
        this.widget.scene.globe.undergroundColor = this.cesium.Color.TRANSPARENT;
        // Keep fog-based tile culling without tinting the map.
        this.widget.scene.fog.renderable = false;
        this.setBackground(options.background ?? MapView.DEFAULT_BACKGROUND);
        this.widget.scene.screenSpaceCameraController.enableInputs = false;
        // The shared viewport owns the camera, including its height above terrain.
        this.widget.scene.screenSpaceCameraController.enableCollisionDetection = false;
        // Load the current view instead of prefetching imagery for distant ancestor tiles.
        this.widget.scene.globe.preloadAncestors = false;
        this.widget.scene.globe.tileLoadProgressEvent.addEventListener((pending : number) => {
            options.OnLoadingChanged?.(pending);
        });
    }

    public setBackground(value : string) : void {
        this.assertAlive();
        const colour = <Cesium.Color | undefined>this.cesium.Color.fromCssColorString(value);
        if (colour === undefined) {
            throw new TypeError("Invalid map background colour.");
        }
        const scene = this.widget.scene;
        scene.backgroundColor = colour;
        scene.globe.baseColor = colour;
        scene.requestRender();
    }

    public setSources(sources : readonly MapSource[]) : void {
        this.assertAlive();
        const layers : ImageryLayer[] = sources.map((source) => {
            if (source === MapSource.OSM) {
                return new this.cesium.ImageryLayer(new this.cesium.OpenStreetMapImageryProvider({
                    url: MapView.OSM_URL, maximumLevel: MapView.MAX_IMAGERY_LEVEL
                }));
            }
            if (source === MapSource.CADASTRE) {
                return new this.cesium.ImageryLayer(new this.cesium.WebMapServiceImageryProvider({
                    url: MapView.CADASTRE_URL,
                    layers: "KN",
                    tilingScheme: new this.cesium.WebMercatorTilingScheme(),
                    rectangle: this.cesium.Rectangle.fromDegrees(MapView.COVERAGE_WEST, MapView.COVERAGE_SOUTH,
                        MapView.COVERAGE_EAST, MapView.COVERAGE_NORTH),
                    parameters: {format: "image/png", transparent: true, version: "1.1.1"},
                    credit: "ČÚZK — katastrální mapa",
                    enablePickFeatures: false
                }));
            }
            const service : string = source === MapSource.ORTHOPHOTO ? "ORTOFOTO" : "ZTM_WM";
            return new this.cesium.ImageryLayer(new this.cesium.UrlTemplateImageryProvider({
                url: `${MapView.MAP_SERVICE_URL}${service}/MapServer/export?` +
                    "bbox={westProjected},{southProjected},{eastProjected},{northProjected}" +
                    "&bboxSR=3857&imageSR=3857&size=256,256&format=png&transparent=true&f=image",
                tilingScheme: new this.cesium.WebMercatorTilingScheme(),
                rectangle: this.cesium.Rectangle.fromDegrees(MapView.COVERAGE_WEST, MapView.COVERAGE_SOUTH,
                    MapView.COVERAGE_EAST, MapView.COVERAGE_NORTH),
                maximumLevel: MapView.MAX_IMAGERY_LEVEL,
                credit: "ČÚZK"
            }));
        });
        this.widget.imageryLayers.removeAll();
        layers.forEach((layer) => {
            this.widget.imageryLayers.add(layer);
        });
        this.widget.scene.requestRender();
    }

    public SyncCamera(state : ICameraState) : void {
        this.assertAlive();
        const position : Cartesian3 = this.toCartesian(state.position);
        const target : Cartesian3 = this.toCartesian(state.target);
        const upPoint : Cartesian3 = this.toCartesian({
            x: state.position.x + state.up.x,
            y: state.position.y + state.up.y,
            z: state.position.z + state.up.z
        });
        this.widget.camera.setView({
            destination: position,
            orientation: {
                direction: this.cesium.Cartesian3.normalize(
                    this.cesium.Cartesian3.subtract(target, position, new this.cesium.Cartesian3()),
                    new this.cesium.Cartesian3()
                ),
                up: this.cesium.Cartesian3.normalize(
                    this.cesium.Cartesian3.subtract(upPoint, position, new this.cesium.Cartesian3()),
                    new this.cesium.Cartesian3()
                )
            }
        });
        const frustum : PerspectiveFrustum = new this.cesium.PerspectiveFrustum({
            fov: state.aspect > 1 ? 2 * Math.atan(Math.tan(state.verticalFov / 2) * state.aspect) : state.verticalFov,
            aspectRatio: state.aspect,
            near: state.near,
            far: Math.max(state.near + MapView.MIN_CLIP_DEPTH, Math.min(state.far, this.viewDistance))
        });
        this.widget.camera.frustum = frustum;
        this.Render();
    }

    public async SampleHeight(point : IVector3, level : number = MapView.DEFAULT_SAMPLE_LEVEL) : Promise<number> {
        this.assertAlive();
        if (!Number.isInteger(level) || level < CuzkTerrain.MIN_LEVEL || level > CuzkTerrain.MAX_LEVEL ||
            this.terrain === undefined) {
            throw new RangeError("DMR sampling requires terrain and a level from 6 to 18.");
        }
        const geographic = this.coordinates.ToGeographic(point);
        const positions = await this.cesium.sampleTerrain(this.terrain.provider, level, [
            this.cesium.Cartographic.fromDegrees(geographic.x, geographic.y)
        ], true);
        this.assertAlive();
        const height : number = positions[0]?.height ?? NaN;
        if (!Number.isFinite(height)) {
            throw new Error("No terrain height at the requested position.");
        }
        return height;
    }

    public Render() : void {
        this.assertAlive();
        this.widget.resize();
        this.widget.scene.requestRender();
        this.widget.render();
    }

    public Project(point : IVector3) : readonly number[] | null {
        this.assertAlive();
        const pixel = this.cesium.SceneTransforms.worldToWindowCoordinates(this.widget.scene, this.toCartesian(point));
        return pixel === undefined ? null : [pixel.x, pixel.y];
    }

    public Dispose() : void {
        if (!this.disposed) {
            this.disposed = true;
            this.terrain?.Dispose();
            this.widget.destroy();
        }
    }

    private toCartesian(point : IVector3) : Cartesian3 {
        const geographic = this.coordinates.ToGeographic(point);
        const longitude : number = geographic.x;
        const latitude : number = geographic.y;
        return this.cesium.Cartesian3.fromRadians(
            this.cesium.Math.toRadians(longitude), this.cesium.Math.toRadians(latitude), point.z
        );
    }

    private assertAlive() : void {
        if (this.disposed) {
            throw new Error("MapView has been disposed.");
        }
    }
}
