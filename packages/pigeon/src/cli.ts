/*
 * Copyright (c) 2025 Andreas Michael
 * This software is under the Apache 2.0 License
 */

import meow from "meow";
import {createConfig} from "./config.js";
import {Database, deleteDir, guided, PigeonError, queryDB, runGeneration} from "./index.js";

import * as path from "node:path";
import fs from "node:fs";

export const cli = meow(
    `
    Usage
      $ pigeon [options]
 
    Options
      --init    setup the config file. Create a .pigeon.json file at the root of the project
      --guided  run Pigeon using a question based command line interface
      --force   overwrites already existing files
      --output  [path:String] output directory for the generated files.
      --config  [path:String] path to .pigeon.json config file.
 
    Examples
      $ pigeon --init
      $ pigeon --output C:/Users/User/Documents/Project
      $ pigeon --output ./generatedFiles --force
      $ pigeon --config ./customPigeonConfig.json
      
    Exit Status
      Pigeon returns the following codes:
    
      - 0: 
        - Generation succeeded, no errors found. 
      - 1: 
        - Generation failed, errors found.
      - 2: 
        - Unexpected error occurred, fatal error.
`,
    {
        flags: {
            init: {
                type: "boolean",
            },
            guided: {
                type: "boolean",
            },
            output: {
                type: "string",
                default: path.join(process.cwd(), "pigeon"),
            },
            force: {
                type: "boolean",
                default: false,
            },
            config: {
                type: "string",
                default: path.join(process.cwd(), ".pigeon.json"),
            },
            cwd: {
                type: "string",
                default: process.cwd(),
            },
        },
        autoHelp: true,
        autoVersion: true,
        importMeta: import.meta,
    }
);

export async function run(flags: any): Promise<void | PigeonError> {
    if (flags.init)
        return createConfig(flags.cwd);
    if (flags.force)
        deleteDir(flags.output);
    if (flags.guided) {
        const params = guided();
        const database = new Database(params.host, String(params.port), params.db, params.user, params.pass);
        const result = await queryDB(database);
        if (result instanceof PigeonError)
            return result;
    }
    if (!fs.existsSync(path.join(process.cwd(), ".pigeon.json")))
        return new PigeonError(1, "", new Error("The configuration file does not exist. Generate one using the \"pigeon --init\" command"));

    const params = JSON.parse(fs.readFileSync(flags.config).toString());
    const database = new Database(params.host, params.port, params.database, params.username, params.password);
    const queryResult = await queryDB(database);
    if (queryResult instanceof PigeonError)
        return queryResult;
    const generationResult = runGeneration(flags.output, database, queryResult.tables, queryResult.enums);
    if (generationResult instanceof PigeonError)
        return generationResult;
}