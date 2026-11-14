/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { parsePoint, checkCommonEntityProperties } from "dxf-parser/dist/ParseHelpers.js";
import { DxfEntityType } from "./DxfEntityType.js";
import { DxfGroupCode } from "./DxfGroupCode.js";

import type { IGroup } from "dxf-parser/dist/DxfArrayScanner.js";
import type { IEntity, IPoint } from "dxf-parser/dist/entities/geomtry.js";

interface ICurveEntity extends IEntity {
    center? : IPoint;
    majorAxisEndPoint? : IPoint;
    extrusionDirection? : IPoint;
    radius? : number;
    axisRatio? : number;
    startAngle : number;
    endAngle : number;
}

// Registered parser handlers retain extrusion normals omitted by dxf-parser's curve handlers.
abstract class CurveHandler {
    private static readonly DEFAULT_LAYER : string = "0";
    private static readonly HALF_TURN_DEGREES : number = 180;
    // eslint-disable-next-line @typescript-eslint/naming-convention -- External dxf-parser handler API.
    public parseEntity(scanner : Parameters<typeof parsePoint>[0], first : IGroup) : IEntity {
        const entity = <ICurveEntity>{type: String(first.value), layer: CurveHandler.DEFAULT_LAYER, startAngle: 0,
            endAngle: Math.PI * 2};
        let group : IGroup = scanner.next();
        while (!scanner.isEOF() && group.code !== DxfGroupCode.ENTITY_TYPE) {
            switch (group.code) {
                case DxfGroupCode.POINT_X:
                    entity.center = parsePoint(scanner);
                    break;
                case DxfGroupCode.SECOND_POINT_X:
                    entity.majorAxisEndPoint = parsePoint(scanner);
                    break;
                case DxfGroupCode.EXTRUSION_X:
                    entity.extrusionDirection = parsePoint(scanner);
                    break;
                case DxfGroupCode.SIZE:
                    if (entity.type === DxfEntityType.ELLIPSE) {
                        entity.axisRatio = Number(group.value);
                    } else {
                        entity.radius = Number(group.value);
                    }
                    break;
                case DxfGroupCode.START_PARAMETER:
                    entity.startAngle = Number(group.value);
                    break;
                case DxfGroupCode.END_PARAMETER:
                    entity.endAngle = Number(group.value);
                    break;
                case DxfGroupCode.START_ANGLE:
                    entity.startAngle = Number(group.value) * Math.PI / CurveHandler.HALF_TURN_DEGREES;
                    break;
                case DxfGroupCode.END_ANGLE:
                    entity.endAngle = Number(group.value) * Math.PI / CurveHandler.HALF_TURN_DEGREES;
                    break;
                default:
                    checkCommonEntityProperties(entity, group, scanner);
            }
            group = scanner.next();
        }
        return entity;
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention -- External dxf-parser handler API.
    public abstract readonly ForEntityName : DxfEntityType.CIRCLE | DxfEntityType.ARC | DxfEntityType.ELLIPSE;
}

export class DxfCircle extends CurveHandler {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- External dxf-parser handler API.
    public override readonly ForEntityName = DxfEntityType.CIRCLE;
}

export class DxfArc extends CurveHandler {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- External dxf-parser handler API.
    public override readonly ForEntityName = DxfEntityType.ARC;
}

export class DxfEllipse extends CurveHandler {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- External dxf-parser handler API.
    public override readonly ForEntityName = DxfEntityType.ELLIPSE;
}

interface IFaceEntity extends IEntity {
    vertices : IPoint[];
}

export class DxfFace {
    private static readonly DEFAULT_LAYER : string = "0";
    // eslint-disable-next-line @typescript-eslint/naming-convention -- External dxf-parser handler API.
    public readonly ForEntityName = DxfEntityType.FACE_3D;

    // eslint-disable-next-line @typescript-eslint/naming-convention -- External dxf-parser handler API.
    public parseEntity(scanner : Parameters<typeof parsePoint>[0], first : IGroup) : IEntity {
        // dxf-parser marks optional entity attributes as required in its declarations.
        const entity = <IFaceEntity><unknown>{type: String(first.value), layer: DxfFace.DEFAULT_LAYER, vertices: []};
        let group : IGroup = scanner.next();
        while (!scanner.isEOF() && group.code !== DxfGroupCode.ENTITY_TYPE) {
            if (group.code >= DxfGroupCode.POINT_X && group.code <= DxfGroupCode.FOURTH_POINT_X) {
                entity.vertices.push(parsePoint(scanner));
            } else {
                checkCommonEntityProperties(entity, group, scanner);
            }
            group = scanner.next();
        }
        return entity;
    }
}
