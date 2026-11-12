/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { expect, test } from "@playwright/test";

test("demo index opens the demo and the demo leads back", async ({page}) => {
    await page.goto("./");
    await page.getByRole("link", {name: /Hello box/}).click();
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");

    await page.getByRole("link", {name: "Demos"}).click();
    await expect(page.getByRole("heading", {name: "oidshaper"})).toBeVisible();
});
