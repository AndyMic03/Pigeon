/*
 * Copyright (c) 2024 Andreas Michael
 * This software is under the Apache 2.0 License
 */

import fs from "node:fs";
import * as path from "node:path";

export function createConfig(dir: string): { exitCode: number, message: string | null, error: Error | null } {
    if (fs.existsSync(path.join(dir, ".pigeon.json"))) {
        return {
            exitCode: 1,
            message: null,
            error: new Error("A Pigeon configuration file already exists."),
        }
    }
    fs.writeFileSync(path.join(dir, ".pigeon.json"), "{\n\t\"host\": \"localhost\",\n\t\"port\": 5432,\n\t\"database\": \"postgres\",\n\t\"username\": \"postgres\",\n\t\"password\": \"xxx\"\n}");
    return {
        exitCode: 0,
        message: "Configuration file successfully created!",
        error: null,
    }
}