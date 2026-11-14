/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { TerrainData } from "./TerrainData.js";

import type { ITerrainOptions } from "./ITerrainOptions.js";
import type * as Cesium from "cesium";
import type { TerrainProvider, TerrainData as CesiumTerrainData } from "cesium";
import type { IMapErrorHandler } from "./MapCallbacks.js";
export interface ITerrainChangedHandler {
    () : void;
}

export class CuzkTerrain {
    public static readonly DEFAULT_SERVICE_URL : string =
        "https://ags.cuzk.gov.cz/arcgis/rest/services/3D/dmr5g_wm/ImageServer/tile/";
    public static readonly DEFAULT_REQUEST_TIMEOUT : number = 15000;
    public static readonly MIN_LEVEL : number = 6;
    public static readonly MAX_LEVEL : number = 18;
    private static readonly MAX_ACTIVE_REQUESTS : number = 6;
    private static readonly TILE_SIZE : number = 257;
    private static readonly EMPTY_TILE_SIZE : number = 65;
    private static readonly ALL_CHILDREN_MASK : number = 15;
    private static readonly COVERAGE_WEST : number = 11.8;
    private static readonly COVERAGE_SOUTH : number = 48.4;
    private static readonly COVERAGE_EAST : number = 19;
    private static readonly COVERAGE_NORTH : number = 51.2;
    public readonly provider : TerrainProvider;
    private readonly abort : AbortController = new AbortController();
    private active : number = 0;
    private readonly options : ITerrainOptions;

    constructor(cesium : typeof Cesium, onError : IMapErrorHandler, onChanged : ITerrainChangedHandler,
        options : ITerrainOptions = {}) {
        this.options = {...options};
        const url = new URL(this.serviceUrl);
        if ((url.protocol !== "https:" && url.protocol !== "http:") || url.search !== "" || url.hash !== "") {
            throw new TypeError("Terrain service URL must be an HTTP(S) base URL without query or fragment.");
        }
        if (!Number.isSafeInteger(this.requestTimeout) || this.requestTimeout <= 0) {
            throw new RangeError("Terrain request timeout must be a positive safe integer in milliseconds.");
        }
        const scheme = new cesium.WebMercatorTilingScheme();
        const extent = cesium.Rectangle.fromDegrees(CuzkTerrain.COVERAGE_WEST, CuzkTerrain.COVERAGE_SOUTH,
            CuzkTerrain.COVERAGE_EAST, CuzkTerrain.COVERAGE_NORTH);
        const error : number = cesium.TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(
            scheme.ellipsoid, CuzkTerrain.TILE_SIZE, 1
        );
        this.provider = {
            tilingScheme: scheme,
            credit: new cesium.Credit("ČÚZK — DMR 5G (Bpv)"),
            errorEvent: new cesium.Event(),
            hasWaterMask: false,
            hasVertexNormals: false,
            availability: undefined,
            getLevelMaximumGeometricError: (level) => error / (2 ** level),
            getTileDataAvailable: (_x, _y, level) => level <= CuzkTerrain.MAX_LEVEL,
            loadTileDataAvailability: () => undefined,
            requestTileGeometry: (x, y, level) : Promise<CesiumTerrainData> | undefined => {
                const rectangle = scheme.tileXYToRectangle(x, y, level);
                if (level < CuzkTerrain.MIN_LEVEL || cesium.Rectangle.intersection(rectangle, extent) === undefined) {
                    return Promise.resolve(new cesium.HeightmapTerrainData({
                        buffer: new Float32Array(CuzkTerrain.EMPTY_TILE_SIZE * CuzkTerrain.EMPTY_TILE_SIZE),
                        width: CuzkTerrain.EMPTY_TILE_SIZE, height: CuzkTerrain.EMPTY_TILE_SIZE,
                        childTileMask: level < CuzkTerrain.MIN_LEVEL ? CuzkTerrain.ALL_CHILDREN_MASK : 0}));
                }
                if (this.active >= CuzkTerrain.MAX_ACTIVE_REQUESTS) {
                    return undefined;
                }
                this.active++;
                return (async () : Promise<CesiumTerrainData> => {
                    try {
                        const response : Response = await fetch(
                            `${this.serviceUrl}${String(level)}/${String(y)}/${String(x)}`,
                            {signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(this.requestTimeout)])}
                        );
                        if (!response.ok) {
                            throw new Error(`DMR tile HTTP ${String(response.status)}`);
                        }
                        const decoded = TerrainData.Decode(await response.arrayBuffer());
                        return new cesium.HeightmapTerrainData({buffer: decoded.heights,
                            width: decoded.width, height: decoded.height,
                            structure: {elementMultiplier: 1}, childTileMask: level < CuzkTerrain.MAX_LEVEL ?
                                CuzkTerrain.ALL_CHILDREN_MASK : 0});
                    } catch (cause : unknown) {
                        if (!this.abort.signal.aborted) {
                            onError(String(cause));
                        }
                        throw cause;
                    } finally {
                        this.active--;
                        if (!this.abort.signal.aborted) {
                            onChanged();
                        }
                    }
                })();
            }
        };
    }

    protected get serviceUrl() : string {
        const url = new URL(this.options.serviceUrl ?? CuzkTerrain.DEFAULT_SERVICE_URL).href;
        return url.endsWith("/") ? url : `${url}/`;
    }

    protected get requestTimeout() : number {
        return this.options.requestTimeout ?? CuzkTerrain.DEFAULT_REQUEST_TIMEOUT;
    }

    public Dispose() : void {
        this.abort.abort();
    }
}
