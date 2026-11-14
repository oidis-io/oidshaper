/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import proj4 from "proj4";

import type { IVector3 } from "./LocalOrigin.js";

export class Coordinates {
    public static readonly JTSK : string = "+proj=krovak +lat_0=49.5 +lon_0=24.83333333333333 " +
        "+alpha=30.2881397527778 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel " +
        "+towgs84=570.8,85.7,462.8,4.998,1.587,5.261,3.56 +units=m +no_defs";
    private readonly conversion : proj4.Converter;

    constructor(source : string = Coordinates.JTSK) {
        this.conversion = proj4(source, "EPSG:4326");
    }

    public ToGeographic(point : IVector3) : IVector3 {
        return this.convert(point, false);
    }

    public FromGeographic(point : IVector3) : IVector3 {
        return this.convert(point, true);
    }

    private convert(point : IVector3, inverse : boolean) : IVector3 {
        if (![point.x, point.y, point.z].every(Number.isFinite)) {
            throw new RangeError("Coordinates must be finite.");
        }
        const result : number[] = inverse ? this.conversion.inverse([point.x, point.y]) :
            this.conversion.forward([point.x, point.y]);
        const x : number = result[0] ?? NaN;
        const y : number = result[1] ?? NaN;
        if (![x, y].every(Number.isFinite)) {
            throw new RangeError("Coordinate conversion failed.");
        }
        return {x, y, z: point.z};
    }
}
