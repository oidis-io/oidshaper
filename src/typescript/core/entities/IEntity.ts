/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import type { IDrawingPath, IMeshGeometry } from "../IDrawing.js";
import type { IVector3 } from "../LocalOrigin.js";
import type { EntityTopology } from "./EntityTopology.js";
import type { EntityTransform } from "./EntityTransform.js";

export enum EntityPartKind {
    VERTEX = "vertex",
    EDGE = "edge",
    FACE = "face"
}

export enum EntityGripRole {
    VERTEX = "vertex",
    CENTRE = "centre",
    RADIUS = "radius"
}

export enum EntitySnapKind {
    ENDPOINT = "endpoint",
    MIDPOINT = "midpoint",
    CENTRE = "centre",
    QUADRANT = "quadrant"
}

export enum EntityTypeId {
    POLYLINE = "polyline",
    CIRCLE = "circle",
    RECTANGLE = "rectangle",
    MESH = "mesh",
    BOX = "box",
    POLYHEDRON = "polyhedron",
    GROUP = "group",
    MODEL = "model"
}

export interface IEntity<TData = unknown> {
    readonly id : string;
    readonly type : string;
    readonly name : string;
    readonly parentId : string | null;
    readonly layer : string;
    readonly transform : EntityTransform;
    readonly data : TData;
}

export interface IEntityPart {
    readonly kind : EntityPartKind;
    readonly id : string;
}

export interface IEntityCapabilities {
    readonly children : boolean;
    readonly grips : boolean;
    readonly topology : boolean;
}

export interface IEntityGrip {
    readonly part? : IEntityPart;
    readonly id : string;
    readonly position : IVector3;
    readonly role : EntityGripRole;
    readonly plane? : EntityTransform;
}

export interface IEntityGeometry {
    readonly paths : readonly IDrawingPath[];
    readonly meshes? : readonly IMeshGeometry[];
}

export interface IEntitySnap {
    readonly part? : IEntityPart;
    readonly position : IVector3;
    readonly kind : EntitySnapKind;
}

export interface IEntityEdit<TData = unknown> {
    readonly type : string;
    readonly data : TData;
}

export interface IEntityType<TData> {
    readonly typeId : string;
    readonly acceptsChildren : boolean;
    getCapabilities?(data : TData) : IEntityCapabilities;
    getTopology?(data : TData) : EntityTopology;
    MovePart?(data : TData, part : IEntityPart, delta : IVector3) : IEntityEdit;
    Validate(data : unknown) : asserts data is TData;
    getGeometry(data : TData) : IEntityGeometry;
    getGrips(data : TData) : readonly IEntityGrip[];
    getSnapPoints?(data : TData) : readonly IEntitySnap[];
    MoveGrip(data : TData, grip : string, point : IVector3) : IEntityEdit;
}

export interface IEntityLayer {
    readonly name : string;
    readonly visible : boolean;
    readonly locked : boolean;
}

export interface IEntityInput<TData = unknown> {
    readonly id? : string;
    readonly type : string;
    readonly name : string;
    readonly parentId? : string | null;
    readonly layer? : string;
    readonly transform? : EntityTransform;
    readonly data : TData;
}

export interface IEntityDocumentData {
    readonly version : 1;
    readonly entities : readonly IEntity[];
    readonly layers : readonly IEntityLayer[];
}
