/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

export enum DxfEntityType {
    POINT = "POINT",
    LINE = "LINE",
    LWPOLYLINE = "LWPOLYLINE",
    POLYLINE = "POLYLINE",
    VERTEX = "VERTEX",
    SEQEND = "SEQEND",
    ARC = "ARC",
    CIRCLE = "CIRCLE",
    ELLIPSE = "ELLIPSE",
    INSERT = "INSERT",
    BLOCK = "BLOCK",
    ENDBLK = "ENDBLK",
    SOLID = "SOLID",
    FACE_3D = "3DFACE",
    TEXT = "TEXT",
    MTEXT = "MTEXT",
    SECTION = "SECTION",
    ENDSEC = "ENDSEC",
    EOF = "EOF"
}

export enum DxfSectionName {
    HEADER = "HEADER",
    ENTITIES = "ENTITIES",
    BLOCKS = "BLOCKS"
}
