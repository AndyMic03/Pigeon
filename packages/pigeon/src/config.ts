/*
 * Copyright (c) 2025 Andreas Michael
 * This software is under the Apache 2.0 License
 */

import {PigeonError} from "./index.js";

import fs from "node:fs";
import * as path from "node:path";

export function createConfig(dir: string): PigeonError {
    if (fs.existsSync(path.join(dir, ".pigeon.json")))
        return new PigeonError(1, "", new Error("A Pigeon configuration file already exists."));

    fs.writeFileSync(path.join(dir, ".pigeon.json"), "{\n\t\"host\": \"localhost\",\n\t\"port\": 5432,\n\t\"database\": \"postgres\",\n\t\"username\": \"postgres\",\n\t\"password\": \"xxx\"\n}");
    return new PigeonError(0, "Configuration file successfully created!", null);
}