/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { describe, it, expect } from "vitest";
import { EntityDocument } from "../../../src/typescript/core/entities/EntityDocument.js";
import { EntityMoveTool } from "../../../src/typescript/tools/EntityMoveTool.js";

describe("entity movement preview", () => {
    it("moves child geometry in preview without changing the document and commits only the parent", () => {
        const document = new EntityDocument();
        document.AddEntities({entities: [
            {id: "group", type: "group", name: "group", data: {}},
            {id: "line", type: "polyline", name: "line", parentId: "group",
                data: {points: [{x: 0, y: 0, z: 0}, {x: 1, y: 0, z: 0}], closed: false}}
        ]});
        const before = document.Serialize();
        const tool = new EntityMoveTool(document, ["group", "line"], {x: 0, y: 0, z: 0});
        expect(tool.Preview({x: 5, y: 0, z: 0}).paths[0]?.points[0]?.x).toBe(5);
        expect(document.Serialize()).toEqual(before);
        tool.Preview({x: 8, y: 0, z: 0});
        tool.Commit();
        expect(document.getGeometry("line")[0]?.points[0]?.x).toBe(8);
        expect(document.getEntity("line")).toEqual(before.entities[1]);
        expect(() => {
            tool.Commit();
        }).toThrow();
        document.Undo();
        expect(document.Serialize()).toEqual(before);
        const cancelled = new EntityMoveTool(document, ["group"], {x: 0, y: 0, z: 0});
        cancelled.Preview({x: 99, y: 0, z: 0}); cancelled.Cancel();
        expect(document.Serialize()).toEqual(before);
        expect(() => {
            cancelled.Commit();
        }).toThrow();
    });
});
