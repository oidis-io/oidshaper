/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import * as Cesium from "cesium";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CuzkTerrain } from "../../../src/typescript/map/CuzkTerrain.js";

class InspectableTerrain extends CuzkTerrain {
    public getServiceUrl() : string {
        return this.serviceUrl;
    }

    public getRequestTimeout() : number {
        return this.requestTimeout;
    }
}

class CustomTerrain extends InspectableTerrain {
    protected override get serviceUrl() : string {
        return "https://terrain.example.test/custom/";
    }

    protected override get requestTimeout() : number {
        return 2500;
    }
}

describe("terrain service options", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("retains the existing service, timeout and attribution when options are omitted", () => {
        const terrain = new InspectableTerrain(Cesium, vi.fn(), vi.fn());
        try {
            expect(terrain.getServiceUrl())
                .toBe("https://ags.cuzk.gov.cz/arcgis/rest/services/3D/dmr5g_wm/ImageServer/tile/");
            expect(terrain.getRequestTimeout()).toBe(15000);
            expect(terrain.provider.credit.html).toBe("ČÚZK — DMR 5G (Bpv)");
        } finally {
            terrain.Dispose();
        }
    });

    for (const serviceUrl of ["https://terrain.example.test/tiles", "https://terrain.example.test/tiles/"]) {
        it(`snapshots options and normalizes ${serviceUrl} for actual requests`, async () => {
            const options = {serviceUrl, requestTimeout: 4321};
            const error = new Error("Controlled request failure");
            const fetchTile = vi.fn<typeof fetch>().mockRejectedValue(error);
            vi.stubGlobal("fetch", fetchTile);
            const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(new AbortController().signal);
            const onError = vi.fn(), onChanged = vi.fn();
            const terrain = new InspectableTerrain(Cesium, onError, onChanged, options);
            options.serviceUrl = "https://changed.example.test/";
            options.requestTimeout = 1;
            try {
                expect(terrain.getServiceUrl()).toBe("https://terrain.example.test/tiles/");
                expect(terrain.getRequestTimeout()).toBe(4321);
                const tile = terrain.provider.tilingScheme.positionToTileXY(Cesium.Cartographic.fromDegrees(14.4, 50.1),
                    10);
                await expect(terrain.provider.requestTileGeometry(tile.x, tile.y, 10)).rejects.toBe(error);
                expect(fetchTile).toHaveBeenCalledTimes(1);
                expect(fetchTile.mock.calls[0]?.[0])
                    .toBe(`https://terrain.example.test/tiles/10/${String(tile.y)}/${String(tile.x)}`);
                expect(fetchTile.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
                expect(timeout).toHaveBeenCalledWith(4321);
                expect(onError).toHaveBeenCalledWith(String(error));
                expect(onChanged).toHaveBeenCalledTimes(1);
            } finally {
                terrain.Dispose();
            }
        });
    }

    it("uses protected subclass defaults without changing the provider contract", () => {
        const terrain = new CustomTerrain(Cesium, vi.fn(), vi.fn());
        try {
            expect(terrain.getServiceUrl()).toBe("https://terrain.example.test/custom/");
            expect(terrain.getRequestTimeout()).toBe(2500);
            expect(terrain.provider.hasWaterMask).toBe(false);
        } finally {
            terrain.Dispose();
        }
    });

    for (const serviceUrl of ["/relative", "not a URL", "file:///tiles", "ftp://terrain.example.test/",
        "https://terrain.example.test/tiles?token=x", "https://terrain.example.test/tiles#fragment"]) {
        it(`rejects invalid service URL ${serviceUrl}`, () => {
            expect(() => new CuzkTerrain(Cesium, vi.fn(), vi.fn(), {serviceUrl})).toThrow(TypeError);
        });
    }

    for (const requestTimeout of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        it(`rejects invalid timeout ${String(requestTimeout)}`, () => {
            expect(() => new CuzkTerrain(Cesium, vi.fn(), vi.fn(), {requestTimeout})).toThrow(RangeError);
        });
    }
});
