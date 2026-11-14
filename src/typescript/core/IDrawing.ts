/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import type { IVector3 } from "./LocalOrigin.js";

export interface IDrawingPath {
    readonly entityId? : string;
    readonly layer : string;
    readonly points : readonly IVector3[];
    readonly closed : boolean;
    readonly colour? : number;
    readonly filled? : boolean;
    readonly curve? : IDrawingCurve;
}

export interface IDrawing {
    readonly paths : readonly IDrawingPath[];
    readonly warnings : readonly string[];
    readonly labels? : readonly IDrawingLabel[];
    readonly meshes? : readonly IMeshGeometry[];
    /** DXF $INSUNITS; coordinates are retained without implicit scaling. */
    readonly units? : number;
}

export interface IMeshGeometry {
    /** Logical face per triangle; absent for unclassified imported meshes. */
    readonly triangleFaces? : readonly string[];
    readonly entityId? : string;
    readonly vertices : readonly IVector3[];
    readonly triangles : readonly number[];
    readonly colour? : number;
    readonly layer : string;
}

export interface IDrawingCurve {
    readonly centre : IVector3;
    readonly axisU : IVector3;
    readonly axisV : IVector3;
    readonly start : number;
    readonly sweep : number;
}

export interface IDrawingLabel {
    readonly layer : string;
    readonly position : IVector3;
    readonly text : string;
    readonly height : number;
    readonly rotation : number;
    readonly colour? : number;
}
