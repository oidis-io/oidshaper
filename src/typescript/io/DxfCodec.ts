/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import ParserModule from "dxf-parser";
import { DxfCircle, DxfArc, DxfEllipse, DxfFace } from "./DxfCurves.js";
import { DxfEntityType, DxfSectionName } from "./DxfEntityType.js";
import { DxfGroupCode } from "./DxfGroupCode.js";

import type {
    DxfParser, IDxf, ILayersTable, IPoint, ILineEntity, ILwpolylineEntity, IPolylineEntity, IEntity, ICircleEntity,
    IArcEntity, IEllipseEntity, IInsertEntity, IPointEntity, ISolidEntity, I3DfaceEntity, ITextEntity,
    IMtextEntity
} from "dxf-parser";
import type { IDrawing, IDrawingPath, IDrawingCurve, IDrawingLabel } from "../core/IDrawing.js";
import type { IVector3 } from "../core/LocalOrigin.js";

export class DxfCodec {
    private static readonly DEFAULT_LAYER : string = "0";
    private static readonly VERSION_HEADER : string = "$ACADVER";
    private static readonly UNITS_HEADER : string = "$INSUNITS";
    private static readonly OUTPUT_VERSION : string = "AC1015";
    private static readonly POLAR_AXIS_THRESHOLD : number = 0.015625;
    private static readonly MAX_EXPANDED_VERTICES : number = 1000000;
    private static readonly CURVE_CHORD_ERROR : number = 0.005;
    private static readonly MIN_CURVE_STEP : number = 0.001;
    private static readonly MAX_CURVE_SEGMENTS : number = 8192;
    private static readonly MIN_CURVE_SEGMENTS : number = 8;
    private static readonly CLOSED_CURVE_TOLERANCE : number = 1e-8;
    private static readonly MAX_BLOCK_DEPTH : number = 32;
    private static readonly MAX_INSERT_INSTANCES : number = 10000;
    private static readonly TEXT_TRANSFORM_TOLERANCE : number = 1e-7;
    private static readonly MAX_TEXT_SIZE : number = 33554432;
    private static readonly ELLIPSE_ORTHOGONALITY_TOLERANCE : number = 1e-6;
    private static readonly HALF_TURN_DEGREES : number = 180;
    private static readonly MIN_FACE_VERTICES : number = 3;
    private static readonly MAX_FACE_VERTICES : number = 4;
    private static readonly BULGE_CENTRE_FACTOR : number = 4;
    private static readonly BULGE_RADIUS_FACTOR : number = 4;
    private static readonly BULGE_SWEEP_FACTOR : number = 4;
    private static readonly SECTION_NAME_OFFSET : number = 3;
    private static readonly CLOSED_3D_POLYLINE_FLAGS : number = 9;
    private static readonly OPEN_3D_POLYLINE_FLAGS : number = 8;
    private static readonly VERTEX_3D_FLAGS : number = 32;

    // The package exposes a CommonJS constructor but declares an ESM namespace.
    private static readonly PATH_ENTITY_TYPES : ReadonlySet<string> = new Set([
        DxfEntityType.LINE, DxfEntityType.LWPOLYLINE, DxfEntityType.POLYLINE]);
    private static readonly PARSER : typeof DxfParser = <typeof DxfParser><unknown>ParserModule;

    private static normalise(point : Partial<IVector3> | undefined) : IVector3 {
        return {x: point?.x ?? 0, y: point?.y ?? 0, z: point?.z ?? 0};
    }

    private static sum(a : IVector3, b : IVector3) : IVector3 {
        return {x: a.x + b.x, y: a.y + b.y, z: a.z + b.z};
    }

    private static subtract(a : IVector3, b : IVector3) : IVector3 {
        return {x: a.x - b.x, y: a.y - b.y, z: a.z - b.z};
    }

    private static scale(a : IVector3, factor : number) : IVector3 {
        return {x: a.x * factor, y: a.y * factor, z: a.z * factor};
    }

    private static length(a : IVector3) : number {
        return Math.hypot(a.x, a.y, a.z);
    }

    private static dot(a : IVector3, b : IVector3) : number {
        return (a.x * b.x) + (a.y * b.y) + (a.z * b.z);
    }

    private static cross(a : IVector3, b : IVector3) : IVector3 {
        return {x: (a.y * b.z) - (a.z * b.y), y: (a.z * b.x) - (a.x * b.z), z: (a.x * b.y) - (a.y * b.x)};
    }

    private static positiveAngle(value : number) : number {
        const full : number = Math.PI * 2;
        return (((value % full) + full) % full) || full;
    }

    private static optionalScale(value : number | undefined) : number {
        return value ?? 1;
    }

    private static layerColour(table : ILayersTable | undefined, name : string) : number | undefined {
        return table?.layers[name]?.color;
    }

    private static unit(point : IVector3) : IVector3 {
        const size : number = DxfCodec.length(point);
        if (!Number.isFinite(size) || size === 0) {
            throw new Error("Invalid DXF extrusion direction.");
        }
        return DxfCodec.scale(point, 1 / size);
    }

    // DXF arbitrary axis algorithm, including normals near the poles.
    private static toWorld(point : IVector3, normal : IVector3) : IVector3 {
        const z : IVector3 = DxfCodec.unit(normal);
        const seed = Math.abs(z.x) < DxfCodec.POLAR_AXIS_THRESHOLD &&
            Math.abs(z.y) < DxfCodec.POLAR_AXIS_THRESHOLD ? {x: 0, y: 1, z: 0} : {x: 0, y: 0, z: 1};
        const x : IVector3 = DxfCodec.unit(DxfCodec.cross(seed, z));
        const y : IVector3 = DxfCodec.cross(z, x);
        return DxfCodec.sum(DxfCodec.sum(DxfCodec.scale(x, point.x), DxfCodec.scale(y, point.y)),
            DxfCodec.scale(z, point.z));
    }

    private static canonicalCurve(curve : IDrawingCurve) : IDrawingCurve {
        // Diagonalise the transformed ellipse instead of losing non-uniform INSERT scaling.
        const u = curve.axisU;
        const v = curve.axisV;
        const angle : number = Math.atan2(2 * DxfCodec.dot(u, v), DxfCodec.dot(u, u) - DxfCodec.dot(v, v)) / 2;
        return {...curve,
            axisU: DxfCodec.sum(DxfCodec.scale(u, Math.cos(angle)), DxfCodec.scale(v, Math.sin(angle))),
            axisV: DxfCodec.sum(DxfCodec.scale(u, -Math.sin(angle)), DxfCodec.scale(v, Math.cos(angle))),
            start: curve.start - angle};
    }

    private static unsupportedEntities(text : string) : string[] {
        const supported  = new Set<string>([DxfEntityType.POINT, DxfEntityType.LINE, DxfEntityType.LWPOLYLINE,
            DxfEntityType.POLYLINE, DxfEntityType.VERTEX, DxfEntityType.SEQEND,
            DxfEntityType.ARC, DxfEntityType.CIRCLE, DxfEntityType.ELLIPSE, DxfEntityType.INSERT,
            DxfEntityType.BLOCK, DxfEntityType.ENDBLK, DxfEntityType.SOLID, DxfEntityType.FACE_3D,
            DxfEntityType.TEXT, DxfEntityType.MTEXT]);
        const lines : string[] = text.split(/\r?\n/);
        const warnings  = new Set<string>();
        let section : string = "";
        for (let i = 0; i + 1 < lines.length; i += 2) {
            if (lines[i]?.trim() !== String(DxfGroupCode.ENTITY_TYPE)) {
                continue;
            }
            const type : string = lines[i + 1]?.trim() ?? "";
            if (type === DxfEntityType.SECTION) {
                section = lines[i + DxfCodec.SECTION_NAME_OFFSET]?.trim() ?? "";
            } else if (type === DxfEntityType.ENDSEC) {
                section = "";
            } else if ((section === DxfSectionName.ENTITIES || section === DxfSectionName.BLOCKS) &&
                !supported.has(type)) {
                warnings.add(`Unsupported entity: ${type}`);
            }
        }
        return [...warnings];
    }

    private static reserve(context : IDxfImportContext, count : number) : void {
        context.vertices += count;
        if (context.vertices > DxfCodec.MAX_EXPANDED_VERTICES) {
            throw new RangeError("Expanded DXF exceeds one million vertices.");
        }
    }

    private static objectPoint(frame : IEntityImportContext, point : IVector3) : IVector3 {
        return DxfCodec.toWorld(point, frame.normal);
    }

    private static add(frame : IEntityImportContext, points : readonly IVector3[], closed : boolean,
        filled : boolean = false) : void {
        DxfCodec.reserve(frame.context, points.length);
        if (points.some((point) => ![point.x, point.y, point.z].every(Number.isFinite))) {
            throw new Error("Invalid DXF coordinates.");
        }
        frame.context.paths.push({layer: frame.layer, points: points.map(frame.transform), closed,
            ...(frame.colour === undefined ? {} : {colour: frame.colour}), ...(filled ? {filled} : {})});
    }

    private static curve(frame : IEntityImportContext, centre : IVector3, u : IVector3, v : IVector3,
        start : number, sweep : number) : void {
        if (![centre.x, centre.y, centre.z, u.x, u.y, u.z, v.x, v.y, v.z, start, sweep]
            .every(Number.isFinite) || DxfCodec.length(u) === 0 || DxfCodec.length(v) === 0) {
            throw new Error("Invalid DXF curve.");
        }
        const world : IVector3 = frame.transform(centre);
        const axisU : IVector3 = DxfCodec.subtract(frame.transform(DxfCodec.sum(centre, u)), world);
        const axisV : IVector3 = DxfCodec.subtract(frame.transform(DxfCodec.sum(centre, v)), world);
        const definition : IDrawingCurve = {centre: world, axisU, axisV, start, sweep};
        const radius : number = Math.max(DxfCodec.length(axisU), DxfCodec.length(axisV));
        const step : number = 2 * Math.acos(Math.max(-1, 1 - (DxfCodec.CURVE_CHORD_ERROR / Math.max(radius,
            DxfCodec.CURVE_CHORD_ERROR))));
        const count : number = Math.min(DxfCodec.MAX_CURVE_SEGMENTS, Math.max(DxfCodec.MIN_CURVE_SEGMENTS,
            Math.ceil(Math.abs(sweep) / Math.max(step, DxfCodec.MIN_CURVE_STEP))));
        DxfCodec.reserve(frame.context, count + 1);
        const points : IVector3[] = [];
        for (let i = 0; i <= count; i++) {
            const angle : number = start + ((sweep * i) / count);
            points.push(DxfCodec.sum(world, DxfCodec.sum(DxfCodec.scale(axisU, Math.cos(angle)),
                DxfCodec.scale(axisV, Math.sin(angle)))));
        }
        frame.context.paths.push({layer: frame.layer, points, closed: Math.abs(sweep) >= ((Math.PI * 2) -
            DxfCodec.CLOSED_CURVE_TOLERANCE),
        curve: definition, ...(frame.colour === undefined ? {} : {colour: frame.colour})});
    }

    private static insertPoint(point : IVector3, frame : IEntityImportContext, insert : IInsertEntity,
        position : IVector3, row : number, column : number, angle : number) : IVector3 {
        const local = DxfCodec.subtract(point, DxfCodec.normalise(position));
        const x : number = (local.x * DxfCodec.optionalScale(insert.xScale)) +
            (column * (insert.columnSpacing || 0));
        const y : number = (local.y * DxfCodec.optionalScale(insert.yScale)) +
            (row * (insert.rowSpacing || 0));
        return frame.transform(DxfCodec.objectPoint(frame, DxfCodec.sum(DxfCodec.normalise(insert.position), {
            x: (x * Math.cos(angle)) - (y * Math.sin(angle)),
            y: (x * Math.sin(angle)) + (y * Math.cos(angle)),
            z: local.z * DxfCodec.optionalScale(insert.zScale)
        })));
    }

    private static visit(context : IDxfImportContext, entity : IEntity, transform : IPointTransform,
        ancestors : readonly string[], inheritedLayer : string) : void {
        const entityType = entity.type;
        const document = context.document;
        const warnings = context.warnings;
        const labels = context.labels;
        const layer : string = entity.layer && (entity.layer !== DxfCodec.DEFAULT_LAYER) ? entity.layer :
            inheritedLayer;
        const colour : number | undefined = Number.isFinite(entity.color) ? entity.color :
            DxfCodec.layerColour(document.tables?.layer, layer);
        const style = colour === undefined ? {} : {colour};
        const extrusion = <IExtrusion>entity;
        const normal = extrusion.extrusionDirection ?? {x: extrusion.extrusionDirectionX ?? 0,
            y: extrusion.extrusionDirectionY ?? 0, z: extrusion.extrusionDirectionZ ?? 1};

        const frame : IEntityImportContext = {context, layer, colour, normal, transform};
        if (entityType === DxfEntityType.INSERT) {
            const insert = <IInsertEntity>entity;
            const block = document.blocks?.[insert.name];
            if ((block === undefined) || ancestors.includes(insert.name) ||
                (ancestors.length >= DxfCodec.MAX_BLOCK_DEPTH)) {
                throw new Error(`Missing or recursive DXF block: ${insert.name}`);
            }
            const angle : number = ((insert.rotation || 0) * Math.PI) / DxfCodec.HALF_TURN_DEGREES;
            const rows : number = insert.rowCount || 1;
            const columns : number = insert.columnCount || 1;
            if ((rows * columns) > DxfCodec.MAX_INSERT_INSTANCES) {
                throw new RangeError("DXF insert array exceeds 10000 instances.");
            }
            for (let row = 0; row < rows; row++) {
                for (let column = 0; column < columns; column++) {
                    block.entities.forEach((item) => {
                        DxfCodec.visit(context, item,
                            (point) => DxfCodec.insertPoint(point, frame, insert, block.position, row, column, angle),
                            [...ancestors, insert.name], layer);
                    });
                }
            }
            return;
        }
        if (entityType === DxfEntityType.POINT) {
            DxfCodec.add(frame, [DxfCodec.normalise((<IPointEntity>entity).position)], false);
            return;
        }
        if ((entityType === DxfEntityType.CIRCLE) || (entityType === DxfEntityType.ARC)) {
            const arc = <ICircleEntity | IArcEntity>entity;
            const start : number = entityType === DxfEntityType.CIRCLE ? 0 : arc.startAngle;
            const sweep : number = entityType === DxfEntityType.CIRCLE ? Math.PI * 2 :
                DxfCodec.positiveAngle(arc.endAngle - start);
            if (!(arc.radius > 0)) {
                throw new RangeError("DXF radius must be positive.");
            }
            DxfCodec.curve(frame, DxfCodec.objectPoint(frame, DxfCodec.normalise(arc.center)),
                DxfCodec.objectPoint(frame, {x: arc.radius, y: 0, z: 0}),
                DxfCodec.objectPoint(frame, {x: 0, y: arc.radius, z: 0}), start, sweep);
            return;
        }
        if (entityType === DxfEntityType.ELLIPSE) {
            const ellipse = <IEllipseEntity>entity;
            const u = DxfCodec.normalise(ellipse.majorAxisEndPoint);
            const v = DxfCodec.scale(DxfCodec.cross(DxfCodec.unit(normal), u), ellipse.axisRatio);
            DxfCodec.curve(frame, DxfCodec.normalise(ellipse.center), u, v, ellipse.startAngle,
                DxfCodec.positiveAngle(ellipse.endAngle - ellipse.startAngle));
            return;
        }
        if ((entityType === DxfEntityType.SOLID) || (entityType === DxfEntityType.FACE_3D)) {
            const points = entityType === DxfEntityType.SOLID ? (<ISolidEntity>entity).points :
                (<I3DfaceEntity>entity).vertices;
            const ordered = (entityType === DxfEntityType.SOLID) && (points.length === DxfCodec.MAX_FACE_VERTICES) ?
                [points[0], points[1], points[3], points[2]] : points;
            DxfCodec.add(frame, ordered.map((point) => entityType === DxfEntityType.SOLID ?
                DxfCodec.objectPoint(frame, DxfCodec.normalise(point)) : DxfCodec.normalise(point)),
            true, true);
            return;
        }
        if ((entityType === DxfEntityType.TEXT) || (entityType === DxfEntityType.MTEXT)) {
            const text = <ITextEntity | IMtextEntity>entity;
            const position = DxfCodec.normalise("position" in text ? text.position : text.startPoint);
            const angle = ((text.rotation || 0) * Math.PI) / DxfCodec.HALF_TURN_DEGREES;
            const world = transform(position);
            const u = DxfCodec.subtract(
                transform(DxfCodec.sum(position, {x: Math.cos(angle), y: Math.sin(angle), z: 0})), world);
            const v = DxfCodec.subtract(
                transform(DxfCodec.sum(position, {x: -Math.sin(angle), y: Math.cos(angle), z: 0})), world);
            const size = DxfCodec.length(v);
            if (!Number.isFinite(size) || size <= 0 || Math.abs(DxfCodec.length(u) - size) > size *
                DxfCodec.TEXT_TRANSFORM_TOLERANCE ||
                Math.abs((u.x * v.x) + (u.y * v.y)) > size * size * DxfCodec.TEXT_TRANSFORM_TOLERANCE ||
                Math.abs(u.z) + Math.abs(v.z) > size * DxfCodec.TEXT_TRANSFORM_TOLERANCE || ((u.x * v.y) - (u.y *
                    v.x)) <= 0) {
                warnings.push(`Unsupported text transform on layer: ${layer}`);
                return;
            }
            labels.push({layer, position: world,
                text: text.text.replace(/\\P/g, "\n"),
                height: ("height" in text ? text.height : text.textHeight) * (ancestors.length === 0 ? 1 : size),
                rotation: ancestors.length === 0 ? text.rotation || 0 : (Math.atan2(u.y, u.x) *
                    DxfCodec.HALF_TURN_DEGREES) / Math.PI,
                ...style});
            return;
        }

        if (!DxfCodec.PATH_ENTITY_TYPES.has(entityType)) {
            warnings.push(`Unsupported entity: ${entity.type}`);
            return;
        }
        const line = <ILineEntity | ILwpolylineEntity | IPolylineEntity>entity;
        if (("vertices" in line) && line.vertices.some((vertex) => ("bulge" in vertex) && (vertex.bulge !== 0) &&
            (vertex.bulge !== undefined))) {
            const vertices = line.vertices;
            const count : number = ("shape" in line) && line.shape ? vertices.length : vertices.length - 1;
            for (let i = 0; i < count; i++) {
                const vertex = vertices[i];
                const next = vertices[(i + 1) % vertices.length];
                if ((vertex === undefined) || (next === undefined)) {
                    continue;
                }
                const elevation : number = "elevation" in line ? line.elevation || 0 : 0;
                const a = {...DxfCodec.normalise(vertex), z: (<Partial<IPoint>>vertex).z ?? elevation};
                const b = {...DxfCodec.normalise(next), z: (<Partial<IPoint>>next).z ?? elevation};
                const bulge : number = "bulge" in vertex ? vertex.bulge || 0 : 0;
                if (bulge === 0) {
                    DxfCodec.add(frame, [DxfCodec.objectPoint(frame, a), DxfCodec.objectPoint(frame, b)], false);
                    continue;
                }
                const dx : number = b.x - a.x;
                const dy : number = b.y - a.y;
                const offset : number = (1 - (bulge * bulge)) / (DxfCodec.BULGE_CENTRE_FACTOR * bulge);
                const centre = {x: ((a.x + b.x) / 2) - (dy * offset), y: ((a.y + b.y) / 2) + (dx * offset), z: a.z};
                const radius : number = (Math.hypot(dx, dy) * (1 + (bulge * bulge))) /
                    (DxfCodec.BULGE_RADIUS_FACTOR * Math.abs(bulge));
                DxfCodec.curve(frame, DxfCodec.objectPoint(frame, centre),
                    DxfCodec.objectPoint(frame, {x: radius, y: 0, z: 0}),
                    DxfCodec.objectPoint(frame, {x: 0, y: radius, z: 0}),
                    Math.atan2(a.y - centre.y, a.x - centre.x), DxfCodec.BULGE_SWEEP_FACTOR * Math.atan(bulge));
            }
            return;
        }
        if (("is3dPolygonMesh" in line) && (line.is3dPolygonMesh || line.isPolyfaceMesh ||
            line.includesCurveFitVertices || line.includesSplineFitVertices)) {
            warnings.push(`Mesh or fitted polyline skipped on layer ${entity.layer}.`);
            return;
        }
        const points : IVector3[] = line.vertices.map((point : Partial<IPoint>) => ({
            x: point.x ?? NaN, y: point.y ?? NaN, z: point.z ?? ("elevation" in line ? line.elevation || 0 : 0)
        }));
        if ((points.length < 2) || points.some((p) => ![p.x, p.y, p.z].every(Number.isFinite))) {
            throw new Error("Invalid DXF path coordinates.");
        }
        const inObjectCoordinates : boolean = entityType === DxfEntityType.LWPOLYLINE ||
            (entityType === DxfEntityType.POLYLINE && !(<IPolylineEntity>line).is3dPolyline);
        DxfCodec.add(frame, inObjectCoordinates ? points.map((point) => DxfCodec.objectPoint(frame, point)) : points,
            ("shape" in line) && line.shape);
    }

    public Import(text : string) : IDrawing {
        if (text.length > DxfCodec.MAX_TEXT_SIZE) {
            throw new RangeError("DXF text exceeds 32 MiB.");
        }
        const parser = new DxfCodec.PARSER();
        parser.registerEntityHandler(DxfCircle);
        parser.registerEntityHandler(DxfArc);
        parser.registerEntityHandler(DxfEllipse);
        parser.registerEntityHandler(DxfFace);
        const document : Partial<IDxf> | null = parser.parseSync(text);
        if (document === null) {
            throw new Error("Empty DXF document.");
        }
        const paths : IDrawingPath[] = [];
        const warnings : string[] = DxfCodec.unsupportedEntities(text);
        const labels : IDrawingLabel[] = [];
        const context : IDxfImportContext = {document, paths, warnings, labels, vertices: 0};
        (document.entities ?? []).forEach((entity) => {
            DxfCodec.visit(context, entity, (point) => point, [], DxfCodec.DEFAULT_LAYER);
        });
        const units = document.header?.[DxfCodec.UNITS_HEADER];
        return {paths, warnings: [...new Set(warnings)], ...(labels.length > 0 ? {labels} : {}),
            ...(typeof units === "number" ? {units} : {})};
    }

    public Export(drawing : IDrawing) : string {
        const lines : Array<string | number> = [DxfGroupCode.ENTITY_TYPE, DxfEntityType.SECTION,
            DxfGroupCode.NAME, DxfSectionName.HEADER, DxfGroupCode.HEADER_VARIABLE, DxfCodec.VERSION_HEADER,
            DxfGroupCode.TEXT, DxfCodec.OUTPUT_VERSION,
            ...(drawing.units === undefined ? [] : [DxfGroupCode.HEADER_VARIABLE, DxfCodec.UNITS_HEADER,
                DxfGroupCode.FLAGS,
                String(drawing.units)]),
            DxfGroupCode.ENTITY_TYPE, DxfEntityType.ENDSEC, DxfGroupCode.ENTITY_TYPE, DxfEntityType.SECTION,
            DxfGroupCode.NAME, DxfSectionName.ENTITIES];
        for (const path of drawing.paths) {
            if (/[\r\n]/.test(path.layer)) {
                throw new Error("Invalid DXF layer name.");
            }
            if ((path.points.length < 1) || path.points.some((p) => ![p.x, p.y, p.z].every(Number.isFinite))) {
                throw new Error("Invalid drawing coordinates.");
            }
            if (path.filled === true) {
                if (path.points.length < DxfCodec.MIN_FACE_VERTICES ||
                    path.points.length > DxfCodec.MAX_FACE_VERTICES) {
                    throw new Error("DXF faces require three or four vertices.");
                }
                lines.push(DxfGroupCode.ENTITY_TYPE, DxfEntityType.FACE_3D, DxfGroupCode.LAYER, path.layer);
                for (let i = 0; i < DxfCodec.MAX_FACE_VERTICES; i++) {
                    const point = path.points[Math.min(i, path.points.length - 1)];
                    if (point !== undefined) {
                        lines.push(DxfGroupCode.POINT_X + i, String(point.x), DxfGroupCode.POINT_Y + i, String(point.y),
                            DxfGroupCode.POINT_Z + i, String(point.z));
                    }
                }
                if (path.colour !== undefined) {
                    lines.push(DxfGroupCode.TRUE_COLOUR, String(path.colour));
                }
                continue;
            }
            if (path.curve !== undefined) {
                const c = DxfCodec.canonicalCurve(path.curve);
                const radius : number = DxfCodec.length(c.axisU);
                const normal = DxfCodec.cross(c.axisU, c.axisV);
                const n : number = DxfCodec.length(normal);
                if ((Math.abs(DxfCodec.dot(c.axisU, c.axisV)) > (DxfCodec.ELLIPSE_ORTHOGONALITY_TOLERANCE *
                    radius * DxfCodec.length(c.axisV))) ||
                    (radius === 0) || (n === 0)) {
                    throw new Error("Cannot export skewed ellipse axes without loss.");
                }
                const start : number = c.sweep < 0 ? c.start + c.sweep : c.start;
                lines.push(DxfGroupCode.ENTITY_TYPE, DxfEntityType.ELLIPSE, DxfGroupCode.LAYER, path.layer,
                    DxfGroupCode.POINT_X, String(c.centre.x), DxfGroupCode.POINT_Y, String(c.centre.y),
                    DxfGroupCode.POINT_Z, String(c.centre.z), DxfGroupCode.SECOND_POINT_X, String(c.axisU.x),
                    DxfGroupCode.SECOND_POINT_Y, String(c.axisU.y), DxfGroupCode.SECOND_POINT_Z, String(c.axisU.z),
                    DxfGroupCode.SIZE, String(DxfCodec.length(c.axisV) / radius), DxfGroupCode.START_PARAMETER,
                    String(start),
                    DxfGroupCode.END_PARAMETER, String(start + Math.abs(c.sweep)),
                    DxfGroupCode.EXTRUSION_X, String(normal.x / n), DxfGroupCode.EXTRUSION_Y, String(normal.y /
                        n), DxfGroupCode.EXTRUSION_Z, String(normal.z / n));
                if (path.colour !== undefined) {
                    lines.push(DxfGroupCode.TRUE_COLOUR, String(path.colour));
                }
                continue;
            }
            if (path.points.length === 1) {
                const point = path.points[0];
                if (point !== undefined) {
                    lines.push(DxfGroupCode.ENTITY_TYPE, DxfEntityType.POINT, DxfGroupCode.LAYER, path.layer,
                        DxfGroupCode.POINT_X, String(point.x), DxfGroupCode.POINT_Y, String(point.y),
                        DxfGroupCode.POINT_Z, String(point.z));
                    if (path.colour !== undefined) {
                        lines.push(DxfGroupCode.TRUE_COLOUR, String(path.colour));
                    }
                }
                continue;
            }
            lines.push(DxfGroupCode.ENTITY_TYPE, DxfEntityType.POLYLINE, DxfGroupCode.LAYER, path.layer,
                DxfGroupCode.ENTITIES_FOLLOW, 1, DxfGroupCode.FLAGS, path.closed ?
                    DxfCodec.CLOSED_3D_POLYLINE_FLAGS : DxfCodec.OPEN_3D_POLYLINE_FLAGS);
            if (path.colour !== undefined) {
                lines.push(DxfGroupCode.TRUE_COLOUR, String(path.colour));
            }
            for (const point of path.points) {
                lines.push(DxfGroupCode.ENTITY_TYPE, DxfEntityType.VERTEX, DxfGroupCode.LAYER, path.layer,
                    DxfGroupCode.FLAGS, DxfCodec.VERTEX_3D_FLAGS, DxfGroupCode.POINT_X, String(point.x),
                    DxfGroupCode.POINT_Y, String(point.y), DxfGroupCode.POINT_Z, String(point.z));
            }
            lines.push(DxfGroupCode.ENTITY_TYPE, DxfEntityType.SEQEND);
        }
        for (const label of drawing.labels ?? []) {
            if (/[\r\n]/.test(label.layer) || ![label.position.x, label.position.y, label.position.z,
                label.height, label.rotation].every(Number.isFinite) || label.height <= 0) {
                throw new Error("Invalid DXF text.");
            }
            lines.push(DxfGroupCode.ENTITY_TYPE, DxfEntityType.MTEXT, DxfGroupCode.LAYER, label.layer,
                DxfGroupCode.POINT_X, String(label.position.x), DxfGroupCode.POINT_Y, String(label.position.y),
                DxfGroupCode.POINT_Z, String(label.position.z), DxfGroupCode.SIZE, String(label.height),
                DxfGroupCode.START_ANGLE, String(label.rotation),
                DxfGroupCode.TEXT, label.text.replace(/\r?\n/g, "\\P"));
            if (label.colour !== undefined) {
                lines.push(DxfGroupCode.TRUE_COLOUR, String(label.colour));
            }
        }
        lines.push(DxfGroupCode.ENTITY_TYPE, DxfEntityType.ENDSEC, DxfGroupCode.ENTITY_TYPE, DxfEntityType.EOF, "");
        return lines.join("\n");
    }
}

interface IPointTransform {
    (point : IVector3) : IVector3;
}

interface IExtrusion extends IEntity {
    extrusionDirection? : IVector3;
    extrusionDirectionX? : number;
    extrusionDirectionY? : number;
    extrusionDirectionZ? : number;
}

interface IDxfImportContext {
    readonly document : Partial<IDxf>;
    readonly paths : IDrawingPath[];
    readonly warnings : string[];
    readonly labels : IDrawingLabel[];
    vertices : number;
}

interface IEntityImportContext {
    readonly context : IDxfImportContext;
    readonly layer : string;
    readonly colour : number | undefined;
    readonly normal : IVector3;
    readonly transform : IPointTransform;
}
