/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

export enum DxfGroupCode {
    ENTITY_TYPE = 0,
    TEXT = 1,
    NAME = 2,
    LAYER = 8,
    HEADER_VARIABLE = 9,
    POINT_X = 10,
    SECOND_POINT_X = 11,
    THIRD_POINT_X = 12,
    FOURTH_POINT_X = 13,
    POINT_Y = 20,
    SECOND_POINT_Y = 21,
    POINT_Z = 30,
    SECOND_POINT_Z = 31,
    SIZE = 40,
    START_PARAMETER = 41,
    END_PARAMETER = 42,
    START_ANGLE = 50,
    END_ANGLE = 51,
    ENTITIES_FOLLOW = 66,
    FLAGS = 70,
    EXTRUSION_X = 210,
    EXTRUSION_Y = 220,
    EXTRUSION_Z = 230,
    TRUE_COLOUR = 420
}

export class DxfGroupCodes {
    private static readonly VALUES : ReadonlyMap<number, DxfGroupCode> = new Map<number, DxfGroupCode>(
        Object.values(DxfGroupCode).filter((value) : value is DxfGroupCode => typeof value === "number")
            .map((value) => [value, value]));

    public static Decode(value : number) : DxfGroupCode | undefined {
        return DxfGroupCodes.VALUES.get(value);
    }
}
